#!/usr/bin/env node
/**
 * Nạp docs/spec/ thành Wiki rồi gán cho các agent trong Memory Hub.
 *
 * Sáu bước, mỗi bước một hệ thống khác nhau — đây là chỗ dễ đứt nhất của cả
 * chuỗi, nên script chạy lại được nhiều lần và in rõ đang ở bước nào:
 *
 *   1. Knowledge :8421  wiki/create        → wiki_id
 *   2. Knowledge :8421  wiki/raw/write     → tải file nguồn lên
 *   3. Knowledge :8421  wiki/ingest        → LLM chưng cất thành page
 *   4. Knowledge :8421  wiki/get           → chờ tới khi ready
 *   5. Knowledge :8421  code-graph/create + sync → index repo public
 *   6. Core      :8420  knowledge/create   → đăng ký cả hai vào metadata
 *   7. Core      :8420  agent-fixed-asset/set → gán theo vai trò
 *
 * Bước 5 là mắt xích hay bị quên: Knowledge service tự nó KHÔNG cho proxy biết
 * wiki tồn tại. Proxy đọc binding từ metadata của Core rồi mới tra chi tiết.
 * Thiếu bước này thì injector log `listAgentKnowledgeIds → 0 ids` và im lặng
 * không nhồi gì cả.
 *
 * Bước 7 dùng `set`, KHÔNG phải `add`: nó thay toàn bộ binding của agent. Nên
 * mỗi lần gọi phải liệt kê đủ mọi asset agent đó cần.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");

// ── Cấu hình ────────────────────────────────────────────────────────────────
// Không nhúng id hay khoá vào file này — repo là public. Mọi thứ đọc từ
// biến môi trường hoặc `.lab-ids` (đã gitignore).

const ids = Object.fromEntries(
  (await readFile(path.join(repo, ".lab-ids"), "utf8"))
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => l.split("=").map((s) => s.trim())),
);

function need(name) {
  const v = process.env[name] ?? ids[name];
  if (!v) throw new Error(`thiếu ${name} — đặt biến môi trường hoặc thêm vào .lab-ids`);
  return v;
}

const IP = process.env.WSL_IP ?? need("wsl_ip");
const KNOWLEDGE = process.env.KNOWLEDGE_URL ?? `http://${IP}:8421/v3`;
const CORE = process.env.CORE_URL ?? `http://${IP}:8420`;
const SERVICE_ID = process.env.SERVICE_ID ?? "default";
const USER_KEY = need("LAB_USER_KEY");
const OWNER = need("LAB_OWNER_ID");

const TEAM = need("team_id");
const AGENTS = { Architect: ids.Architect, Builder: ids.Builder, Reviewer: ids.Reviewer };

const step = (n, msg) => console.log(`\n[${n}] ${msg}`);
const info = (msg) => console.log(`    ${msg}`);

async function post(base, route, body, extraHeaders = {}) {
  const res = await fetch(`${base}${route}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tdai-service-id": SERVICE_ID,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${route}: phản hồi không phải JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  if (json.code !== undefined && json.code !== 0 && json.code !== 200) {
    throw new Error(`${route}: code=${json.code} ${json.message ?? ""}`);
  }
  if (!res.ok) throw new Error(`${route}: HTTP ${res.status} ${text.slice(0, 200)}`);
  return json.data ?? json;
}

// ── 1–2. Tạo wiki và tải file nguồn ─────────────────────────────────────────

step(1, "Tạo wiki asset");
const created = await post(KNOWLEDGE, "/wiki/create", {
  team_id: TEAM,
  user_id: OWNER,
  name: "Linear Lab — đặc tả sản phẩm",
});
const wikiId = created.wiki_id ?? created.id;
info(`wiki_id = ${wikiId}`);

step(2, "Tải docs/spec/ lên");
const specDir = path.join(repo, "docs", "spec");
const names = (await readdir(specDir)).filter((f) => f.endsWith(".md")).sort();
const files = await Promise.all(
  names.map(async (filename) => ({
    filename,
    content: await readFile(path.join(specDir, filename), "utf8"),
  })),
);
const totalKb = Math.round(files.reduce((n, f) => n + Buffer.byteLength(f.content), 0) / 1024);
await post(KNOWLEDGE, "/wiki/raw/write", { team_id: TEAM, wiki_id: wikiId, user_id: OWNER, files });
info(`${files.length} file, ${totalKb} KB: ${names.join(", ")}`);

// ── 3–4. Chưng cất và chờ ───────────────────────────────────────────────────

step(3, "Chạy ingest (LLM chưng cất thành page)");
await post(KNOWLEDGE, "/wiki/ingest", { team_id: TEAM, wiki_id: wikiId, user_id: OWNER });
info("đã gửi, đang chạy nền…");

step(4, "Chờ tới khi ready");
const deadline = Date.now() + 10 * 60_000;
let detail;
let lastStatus = "";
while (Date.now() < deadline) {
  detail = await post(KNOWLEDGE, "/wiki/get", { team_id: TEAM, wiki_id: wikiId });
  const s = detail.status ?? "unknown";
  if (s !== lastStatus) {
    info(`status = ${s}${detail.page_count ? ` (${detail.page_count} page)` : ""}`);
    lastStatus = s;
  }
  if (s === "ready") break;
  if (s === "failed") throw new Error(`ingest thất bại: ${detail.error ?? "không rõ lý do"}`);
  await new Promise((r) => setTimeout(r, 5000));
}
if (detail?.status !== "ready") throw new Error("hết giờ chờ ingest");
info(`xong: ${detail.page_count ?? "?"} page`);

// ── 5. CodeGraph ────────────────────────────────────────────────────────────
// Fetcher CHỈ nhận public HTTPS — `src/source-fetcher/git-fetcher.ts` chặn cứng
// mọi thứ khác, kể cả `file://` và địa chỉ nội bộ. Nên repo phải công khai.

const REPO_URL = process.env.REPO_URL ?? ids.repo_url;
let cgId = null;

if (!REPO_URL) {
  step(5, "Bỏ qua CodeGraph — chưa có repo_url");
  info("đặt REPO_URL hoặc thêm repo_url vào .lab-ids");
} else {
  step(5, `Tạo CodeGraph từ ${REPO_URL}`);
  const cg = await post(KNOWLEDGE, "/code-graph/create", {
    team_id: TEAM,
    user_id: OWNER,
    repo_url: REPO_URL,
    branch: process.env.REPO_BRANCH ?? "main",
    repo_name: "linear-lab",
  });
  cgId = cg.code_graph_id ?? cg.id;
  info(`code_graph_id = ${cgId}`);

  await post(KNOWLEDGE, "/code-graph/sync", { team_id: TEAM, code_graph_id: cgId, user_id: OWNER })
    .then(() => info("đã gửi sync"))
    .catch((e) => info(`sync có thể đã tự chạy lúc create: ${e.message}`));

  const cgDeadline = Date.now() + 10 * 60_000;
  let cgStatus = "";
  while (Date.now() < cgDeadline) {
    const d = await post(KNOWLEDGE, "/code-graph/get", { team_id: TEAM, code_graph_id: cgId });
    const st = d.status ?? "unknown";
    if (st !== cgStatus) {
      info(`status = ${st}`);
      cgStatus = st;
    }
    if (st === "ready") break;
    if (st === "failed") {
      info(`index thất bại: ${d.error ?? "không rõ"} — vẫn đăng ký wiki, bỏ code-graph`);
      cgId = null;
      break;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  if (cgId && cgStatus !== "ready") {
    info("hết giờ chờ index — bỏ code-graph khỏi phần gán");
    cgId = null;
  }
}

// ── 6. Đăng ký vào metadata của Core ────────────────────────────────────────

step(6, "Đăng ký knowledge vào MemoryCore");
await post(
  CORE,
  "/v3/knowledge/create",
  {
    knowledge_id: wikiId,
    type: "wiki",
    service_url: KNOWLEDGE,
    name: "Linear Lab — đặc tả sản phẩm",
    summary: "Đặc tả issue tracker: mô hình dữ liệu, máy trạng thái, API, UI, quy ước code",
    team_id: TEAM,
    user_id: OWNER,
  },
  { "x-tdai-user-key": USER_KEY },
);
info("wiki đã đăng ký — giờ proxy mới nhìn thấy được");

if (cgId) {
  await post(
    CORE,
    "/v3/knowledge/create",
    {
      knowledge_id: cgId,
      type: "code-graph",
      service_url: KNOWLEDGE,
      name: "linear-lab — đồ thị mã nguồn",
      summary: "Ký hiệu, file, quan hệ gọi và phạm vi ảnh hưởng của repo linear-lab",
      team_id: TEAM,
      user_id: OWNER,
      repo_url: REPO_URL,
      branch: process.env.REPO_BRANCH ?? "main",
    },
    { "x-tdai-user-key": USER_KEY },
  );
  info("code-graph đã đăng ký");
}

// ── 7. Gán asset theo vai trò ───────────────────────────────────────────────
// Mỗi vai trò một loadout riêng — đây chính là điểm của Memory Hub: không phải
// ai cũng nhận mọi thứ. Hiện cả ba cùng cần spec + đồ thị mã; khi có Skill
// riêng cho từng vai trò thì bảng này mới thực sự phân hoá.

const wikiBinding = {
  asset_id: wikiId, asset_type: "llm_wiki", injection_mode: "tool", priority: 10, created_by: OWNER,
};
const cgBinding = cgId
  ? { asset_id: cgId, asset_type: "code_graph", injection_mode: "tool", priority: 20, created_by: OWNER }
  : null;

const LOADOUT = {
  Architect: [wikiBinding, cgBinding], // spec + đồ thị để quyết ranh giới module
  Builder: [wikiBinding, cgBinding],   // spec để biết làm gì, đồ thị để biết sửa đâu
  Reviewer: [wikiBinding, cgBinding],  // đồ thị để soi ảnh hưởng, spec để đối chiếu ràng buộc
};

step(7, "Gán asset cho từng agent");
for (const [name, agentId] of Object.entries(AGENTS)) {
  if (!agentId) {
    info(`bỏ qua ${name}: thiếu agent_id`);
    continue;
  }
  const bindings = (LOADOUT[name] ?? []).filter(Boolean);
  // `set` THAY THẾ toàn bộ binding của agent, không phải thêm vào.
  await post(
    CORE,
    "/v3/meta/agent-fixed-asset/set",
    { agent_id: agentId, bindings },
    { "x-tdai-user-key": USER_KEY },
  );
  info(`${name} ← ${bindings.map((b) => b.asset_type).join(" + ") || "(rỗng)"}`);
}

console.log(`\nXong. wiki=${wikiId}  code_graph=${cgId ?? "(bỏ qua)"}`);
console.log("Kiểm chứng: npm run check:stack, rồi hỏi agent một câu về nội dung spec.");
