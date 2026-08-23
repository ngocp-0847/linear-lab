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
 *   5. Core      :8420  knowledge/create   → đăng ký vào metadata
 *   6. Core      :8420  agent-fixed-asset/set → gán cho từng agent
 *
 * Bước 5 là mắt xích hay bị quên: Knowledge service tự nó KHÔNG cho proxy biết
 * wiki tồn tại. Proxy đọc binding từ metadata của Core rồi mới tra chi tiết.
 * Thiếu bước này thì injector log `listAgentKnowledgeIds → 0 ids` và im lặng
 * không nhồi gì cả.
 *
 * Bước 6 dùng `set`, KHÔNG phải `add`: nó thay toàn bộ binding của agent. Nên
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

// ── 5. Đăng ký vào metadata của Core ────────────────────────────────────────

step(5, "Đăng ký knowledge vào MemoryCore");
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
info("đã đăng ký — giờ proxy mới nhìn thấy được");

// ── 6. Gán cho agent ────────────────────────────────────────────────────────

step(6, "Gán wiki cho từng agent");
for (const [name, agentId] of Object.entries(AGENTS)) {
  if (!agentId) {
    info(`bỏ qua ${name}: thiếu agent_id`);
    continue;
  }
  // `set` THAY THẾ toàn bộ binding của agent, không phải thêm vào.
  await post(
    CORE,
    "/v3/meta/agent-fixed-asset/set",
    {
      agent_id: agentId,
      bindings: [
        { asset_id: wikiId, asset_type: "llm_wiki", injection_mode: "tool", priority: 10, created_by: OWNER },
      ],
    },
    { "x-tdai-user-key": USER_KEY },
  );
  info(`${name} (${agentId}) ← wiki`);
}

console.log(`\nXong. wiki_id = ${wikiId}`);
console.log("Kiểm chứng: npm run check:stack, rồi hỏi agent một câu về nội dung spec.");
