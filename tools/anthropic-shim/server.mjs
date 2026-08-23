#!/usr/bin/env node
/**
 * Anthropic → OpenAI shim.
 *
 * ## Vì sao cần
 *
 * MemoryProxy của TencentDB Agent Memory **giữ nguyên giao thức, không dịch
 * giao thức**: nó parse và inject theo wire format của client rồi forward
 * nguyên path lên upstream. Nên Claude Code (Anthropic Messages) đi qua proxy
 * sẽ gõ vào `api.openai.com/v1/messages` — endpoint không tồn tại → 404.
 *
 * Shim này đứng làm upstream riêng cho nhánh `claude-code`:
 *
 *   Claude Code ──► MemoryProxy /claude-code/<space>/v1/messages
 *                        │  (inject memory + skill + knowledge)
 *                        ▼
 *                   shim :8097/v1/messages
 *                        │  (dịch Anthropic ⇄ OpenAI)
 *                        ▼
 *                   api.openai.com/v1/chat/completions
 *
 * Proxy vẫn làm đúng việc của nó; shim chỉ lo phần ngôn ngữ.
 *
 * ## Phạm vi
 *
 * Đủ cho Claude Code chạy thật: streaming, tool use, system prompt dạng block,
 * `count_tokens`. KHÔNG làm: vision, prompt caching, extended thinking,
 * batch API. Gặp mấy thứ đó thì shim bỏ qua chứ không giả vờ hỗ trợ.
 *
 * Không phụ thuộc package nào — chạy thẳng bằng `node server.mjs`.
 */

import { createServer } from "node:http";

const PORT = Number(process.env.SHIM_PORT || 8097);
const HOST = process.env.SHIM_HOST || "0.0.0.0";
const OPENAI_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const DEFAULT_MODEL = process.env.SHIM_MODEL || "gpt-5.5";
const DEBUG = process.env.SHIM_DEBUG === "1";

if (!OPENAI_KEY) {
  console.error("[shim] thiếu OPENAI_API_KEY");
  process.exit(1);
}

const log = (...a) => console.log(new Date().toISOString(), "[shim]", ...a);
const dbg = (...a) => DEBUG && log(...a);

/**
 * Dòng model suy luận của OpenAI đổi hợp đồng tham số: từ chối `max_tokens`
 * và chỉ nhận `temperature=1`. Nhận diện theo tiền tố vì OpenAI ra model mới
 * liên tục, allow-list sẽ hỏng ngay lần phát hành sau.
 */
const isReasoning = (m) => /^(o[1-9]|gpt-5)/i.test(String(m || "").trim());

// ── Anthropic → OpenAI ──────────────────────────────────────────────────────

/** System của Anthropic có thể là string hoặc mảng block. */
function systemToText(system) {
  if (!system) return "";
  if (typeof system === "string") return system;
  if (Array.isArray(system)) {
    return system.map((b) => (typeof b === "string" ? b : b?.text || "")).join("\n\n");
  }
  return "";
}

/**
 * Chuyển messages. Điểm khó: Anthropic gói tool_use / tool_result thành content
 * block trong message của assistant / user, còn OpenAI tách thành `tool_calls`
 * trên assistant và role `tool` riêng. Một message Anthropic có thể nở ra
 * nhiều message OpenAI.
 */
function toOpenAiMessages(anthropicMessages, systemText) {
  const out = [];
  if (systemText) out.push({ role: "system", content: systemText });

  for (const m of anthropicMessages || []) {
    const blocks = typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content || [];

    if (m.role === "user") {
      // tool_result phải thành message role=tool ĐỨNG TRƯỚC phần text còn lại,
      // vì OpenAI yêu cầu tool result nối ngay sau assistant đã gọi tool.
      const toolResults = blocks.filter((b) => b?.type === "tool_result");
      for (const tr of toolResults) {
        out.push({
          role: "tool",
          tool_call_id: tr.tool_use_id,
          content: typeof tr.content === "string" ? tr.content : blockText(tr.content),
        });
      }
      const rest = blocks.filter((b) => b?.type !== "tool_result");
      const text = blockText(rest);
      if (text) out.push({ role: "user", content: text });
      continue;
    }

    if (m.role === "assistant") {
      const toolUses = blocks.filter((b) => b?.type === "tool_use");
      const text = blockText(blocks.filter((b) => b?.type !== "tool_use"));
      const msg = { role: "assistant", content: text || null };
      if (toolUses.length) {
        msg.tool_calls = toolUses.map((t) => ({
          id: t.id,
          type: "function",
          function: { name: t.name, arguments: JSON.stringify(t.input ?? {}) },
        }));
      }
      out.push(msg);
      continue;
    }

    const text = blockText(blocks);
    if (text) out.push({ role: m.role === "system" ? "system" : "user", content: text });
  }
  return out;
}

function blockText(blocks) {
  if (typeof blocks === "string") return blocks;
  return (blocks || [])
    .filter((b) => b && (b.type === "text" || typeof b.text === "string"))
    .map((b) => b.text || "")
    .join("");
}

function toOpenAiBody(a) {
  const model = a.model && !/^claude/i.test(a.model) ? a.model : DEFAULT_MODEL;
  const body = {
    model,
    messages: toOpenAiMessages(a.messages, systemToText(a.system)),
    stream: Boolean(a.stream),
  };
  if (body.stream) body.stream_options = { include_usage: true };

  const cap = a.max_tokens || 4096;
  if (isReasoning(model)) {
    // Token suy luận cũng tính vào hạn mức này → nới trần để phần trả lời
    // nhìn thấy được không bị bóp thành rỗng.
    body.max_completion_tokens = Math.max(cap, 4000);
  } else {
    body.max_tokens = cap;
    if (typeof a.temperature === "number") body.temperature = a.temperature;
  }

  if (Array.isArray(a.stop_sequences) && a.stop_sequences.length) body.stop = a.stop_sequences;

  if (Array.isArray(a.tools) && a.tools.length) {
    body.tools = a.tools
      .filter((t) => t?.name)
      .map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description || "",
          parameters: t.input_schema || { type: "object", properties: {} },
        },
      }));
    if (a.tool_choice?.type === "tool" && a.tool_choice.name) {
      body.tool_choice = { type: "function", function: { name: a.tool_choice.name } };
    } else if (a.tool_choice?.type === "any") body.tool_choice = "required";
    else if (a.tool_choice?.type === "none") body.tool_choice = "none";
    else if (body.tools.length) body.tool_choice = "auto";
  }
  return body;
}

const STOP_MAP = { stop: "end_turn", length: "max_tokens", tool_calls: "tool_use", content_filter: "end_turn" };

// ── OpenAI → Anthropic (không stream) ───────────────────────────────────────

function toAnthropicResponse(oa, requestedModel) {
  const choice = oa.choices?.[0] || {};
  const msg = choice.message || {};
  const content = [];
  if (msg.content) content.push({ type: "text", text: msg.content });
  for (const tc of msg.tool_calls || []) {
    let input = {};
    try {
      input = JSON.parse(tc.function?.arguments || "{}");
    } catch {
      input = {};
    }
    content.push({ type: "tool_use", id: tc.id, name: tc.function?.name, input });
  }
  return {
    id: oa.id || `msg_${Date.now()}`,
    type: "message",
    role: "assistant",
    model: requestedModel || oa.model,
    content,
    stop_reason: STOP_MAP[choice.finish_reason] || "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: oa.usage?.prompt_tokens ?? 0,
      output_tokens: oa.usage?.completion_tokens ?? 0,
    },
  };
}

// ── OpenAI SSE → Anthropic SSE ──────────────────────────────────────────────

function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * Anthropic stream có cấu trúc block rõ ràng: mỗi khối text hay tool_use được
 * mở bằng content_block_start, đổ delta, rồi đóng bằng content_block_stop.
 * OpenAI thì phẳng — phải tự dựng lại ranh giới khối.
 */
async function streamTranslate(upstreamBody, res, requestedModel) {
  const msgId = `msg_${Math.random().toString(36).slice(2, 14)}`;

  sse(res, "message_start", {
    type: "message_start",
    message: {
      id: msgId,
      type: "message",
      role: "assistant",
      model: requestedModel,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    },
  });

  let nextIndex = 0;
  let textIndex = -1;          // index của khối text đang mở, -1 = chưa mở
  const toolSlots = new Map(); // openai tool_call index → { blockIndex, id, name }
  let stopReason = "end_turn";
  let usage = { input_tokens: 0, output_tokens: 0 };

  const reader = upstreamBody.getReader();
  const dec = new TextDecoder();
  let buf = "";

  const closeText = () => {
    if (textIndex >= 0) {
      sse(res, "content_block_stop", { type: "content_block_stop", index: textIndex });
      textIndex = -1;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });

    let i;
    while ((i = buf.indexOf("\n\n")) !== -1) {
      const raw = buf.slice(0, i);
      buf = buf.slice(i + 2);

      const line = raw.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;

      let chunk;
      try {
        chunk = JSON.parse(payload);
      } catch {
        continue;
      }

      if (chunk.usage) {
        usage = {
          input_tokens: chunk.usage.prompt_tokens ?? usage.input_tokens,
          output_tokens: chunk.usage.completion_tokens ?? usage.output_tokens,
        };
      }

      const ch = chunk.choices?.[0];
      if (!ch) continue;
      const delta = ch.delta || {};

      if (delta.content) {
        if (textIndex < 0) {
          textIndex = nextIndex++;
          sse(res, "content_block_start", {
            type: "content_block_start",
            index: textIndex,
            content_block: { type: "text", text: "" },
          });
        }
        sse(res, "content_block_delta", {
          type: "content_block_delta",
          index: textIndex,
          delta: { type: "text_delta", text: delta.content },
        });
      }

      for (const tc of delta.tool_calls || []) {
        let slot = toolSlots.get(tc.index);
        if (!slot) {
          // Tool bắt đầu → đóng khối text đang mở, Anthropic không cho lồng.
          closeText();
          slot = { blockIndex: nextIndex++, id: tc.id || `call_${tc.index}`, name: tc.function?.name || "" };
          toolSlots.set(tc.index, slot);
          sse(res, "content_block_start", {
            type: "content_block_start",
            index: slot.blockIndex,
            content_block: { type: "tool_use", id: slot.id, name: slot.name, input: {} },
          });
        }
        if (tc.function?.arguments) {
          sse(res, "content_block_delta", {
            type: "content_block_delta",
            index: slot.blockIndex,
            delta: { type: "input_json_delta", partial_json: tc.function.arguments },
          });
        }
      }

      if (ch.finish_reason) stopReason = STOP_MAP[ch.finish_reason] || "end_turn";
    }
  }

  closeText();
  for (const slot of toolSlots.values()) {
    sse(res, "content_block_stop", { type: "content_block_stop", index: slot.blockIndex });
  }
  sse(res, "message_delta", {
    type: "message_delta",
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: { output_tokens: usage.output_tokens },
  });
  sse(res, "message_stop", { type: "message_stop" });
  res.end();
}

// ── HTTP ────────────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

function anthropicError(res, status, type, message) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ type: "error", error: { type, message } }));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const path = url.pathname;

  if (path === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "ok", upstream: OPENAI_URL, model: DEFAULT_MODEL }));
  }

  // Claude Code hỏi số token trước khi gửi. Trả ước lượng thô còn hơn 404 —
  // con số này không ảnh hưởng tới kết quả, chỉ dùng để hiển thị.
  if (path.endsWith("/v1/messages/count_tokens") && req.method === "POST") {
    const raw = await readBody(req).catch(() => "");
    let n = 0;
    try {
      const a = JSON.parse(raw || "{}");
      const text = systemToText(a.system) + JSON.stringify(a.messages || []);
      n = Math.ceil(text.length / 3.5);
    } catch { /* thôi, trả 0 */ }
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ input_tokens: n }));
  }

  if (!path.endsWith("/v1/messages") || req.method !== "POST") {
    return anthropicError(res, 404, "not_found_error", `shim không phục vụ ${req.method} ${path}`);
  }

  let a;
  try {
    a = JSON.parse(await readBody(req));
  } catch {
    return anthropicError(res, 400, "invalid_request_error", "body không phải JSON");
  }

  const body = toOpenAiBody(a);
  dbg(`→ ${body.model} msgs=${body.messages.length} tools=${body.tools?.length ?? 0} stream=${body.stream}`);

  let upstream;
  try {
    upstream = await fetch(`${OPENAI_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify(body),
    });
  } catch (e) {
    log("upstream lỗi mạng:", String(e));
    return anthropicError(res, 502, "api_error", `không gọi được upstream: ${String(e)}`);
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    log(`upstream ${upstream.status}: ${detail.slice(0, 300)}`);
    return anthropicError(res, upstream.status, "api_error", detail.slice(0, 600) || `HTTP ${upstream.status}`);
  }

  if (!body.stream) {
    const oa = await upstream.json();
    const out = toAnthropicResponse(oa, a.model);
    dbg(`← blocks=${out.content.length} stop=${out.stop_reason}`);
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(out));
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  try {
    await streamTranslate(upstream.body, res, a.model || body.model);
  } catch (e) {
    log("lỗi giữa stream:", String(e));
    try {
      sse(res, "error", { type: "error", error: { type: "api_error", message: String(e) } });
      res.end();
    } catch { /* client đã ngắt */ }
  }
});

server.listen(PORT, HOST, () => {
  log(`nghe http://${HOST}:${PORT}  →  ${OPENAI_URL}  (model mặc định ${DEFAULT_MODEL})`);
});
