# Runbook — hạ tầng agent memory

Bốn dịch vụ, tất cả chạy trong WSL (Ubuntu 24.04). Windows gọi vào qua IP của WSL.

| Dịch vụ | Cổng | Khởi động | Node |
| --- | --- | --- | --- |
| MemoryCore | 8420 | `wsl -- bash -lc 'bash ~/start-core-lab.sh'` | v24 |
| MemoryProxy | 8096 | `wsl -- bash -lc 'bash ~/start-proxy.sh'` | **v22 bắt buộc** |
| Anthropic shim | 8097 | `wsl -- bash -lc 'bash ~/start-shim.sh'` | v24 |
| Memory Hub | 8123 | `wsl -- bash -lc 'cd ~/workspace/tdam/MemoryPanel && npx tsx src/index.ts'` | v24 |
| MemoryKnowledge | 8421 | `wsl -- bash -lc 'bash ~/knowledge-node22.sh'` | **v22 bắt buộc** |

IP WSL đổi mỗi lần khởi động lại: `wsl -- hostname -I`.

## Định danh của lab

Các id do server sinh ra lúc dựng, **không commit** — chúng nằm trong `.lab-ids`
ở gốc repo (đã gitignore) để script tự đọc:

```
team_id       team-xxxxxxxx     tên team
Architect     agt-xxxxxxxx
Builder       agt-xxxxxxxx
Reviewer      agt-xxxxxxxx
instance      default           (x-tdai-service-id)
```

`user_key` của admin đặt qua biến môi trường `LAB_USER_KEY`. Đây là lab chạy
trên máy cá nhân nên khoá chỉ là chuỗi tuỳ ý — nhưng đừng commit, và đừng dùng
lại kiểu đặt khoá này cho thứ gì chạm mạng thật.

---

## Bảy thứ phải biết, không có trong tài liệu

Tất cả đều tìm ra bằng cách chạy thật rồi đọc log, không suy ra được từ docs.

### 1. MemoryProxy chặn cứng Node v22

`src/index.ts` kiểm tra `process.version.startsWith("v22.")` rồi `process.exit(1)`. Node 24 chết ngay. Đã cài nvm + v22.23.2; `start-proxy.sh` tự `nvm use 22`.

### 2. Gateway phải TẮT API key

`MemoryProxy/src/auth.ts` gọi `/v3/meta/auth/verify` **không kèm `Authorization`**. Nếu MemoryCore bật `TDAI_GATEWAY_API_KEY` thì mọi request qua proxy đều 401 với thông báo lạc hướng *"auth service returned HTTP 401"*.

Gateway chỉ **cảnh báo** chứ không chặn khi bind non-loopback mà không có key, nên bỏ key là chạy được.

> ⚠️ Đánh đổi thật: gateway không xác thực trên interface WSL. Chỉ chấp nhận được cho lab trên máy cá nhân. Đưa ra mạng chung thì phải đặt proxy và core cùng một network namespace rồi bind core vào loopback.

### 3. Proxy giữ nguyên giao thức, KHÔNG dịch giao thức

Nó parse + inject theo wire format của client rồi forward **nguyên path** lên upstream.

```
Codex   /codex/<sp>/v1/responses       → upstream/v1/responses      ✅ OpenAI có
Claude  /claude-code/<sp>/v1/messages  → upstream/v1/messages       ❌ OpenAI không có → 404
```

Vì chỉ có key OpenAI nên nhánh `claude-code` phải đi qua [tools/anthropic-shim](../tools/anthropic-shim/server.mjs) — dịch Anthropic ⇄ OpenAI. Nối vào bằng `upstream.agents`:

```yaml
upstream:
  url: https://api.openai.com/v1          # codex dùng
  agents:
    claude-code:
      url: "http://127.0.0.1:8097/v1"     # shim
```

Có key Anthropic thật thì bỏ shim, trỏ thẳng `https://api.anthropic.com/v1`.

### 4. Mỗi client dùng MỘT header session KHÁC NHAU

Đây là chỗ tốn nhiều thời gian nhất. Thiếu header session thì injection **im lặng không chạy** — request vẫn 200, model vẫn trả lời, chỉ là không có memory.

| Client | Header session | Nguồn |
| --- | --- | --- |
| Claude Code | `x-conversation-id` | `src/identity.ts:133` |
| Codex | `session-id` (hoặc `body.client_metadata.session_id`) | `extractCodexSessionId`, `codexHandler.ts:167` |

Cộng với ba header định danh, đủ bộ để bỏ qua form tương tác:

```
x-team-id  +  x-agent-id  +  x-task-id  +  <header session của client>
```

Cách nhận biết injection có chạy hay không: so `input_tokens`. Không inject ≈ 24; có inject ≈ 3.100.

### 5. `x-tdai-service-id` cách ly cả tầng metadata

Không chỉ dữ liệu memory. User/team/agent tạo dưới instance này **không tồn tại** ở instance kia — `user_key` hợp lệ ở `A` sẽ trả `invalid_user_key` ở `B`. Mỗi instance phải `init-admin` riêng:

```bash
curl -X POST http://<wsl-ip>:8420/v3/internal/meta/user/init-admin \
  -H 'Content-Type: application/json' -H 'x-tdai-service-id: default' \
  -d "{\"username\":\"lab-admin\",\"user_key\":\"$LAB_USER_KEY\"}"
```

### 6. Task là bắt buộc, không phải tuỳ chọn

Header auto-select cần **đủ cả ba** id. Thiếu `x-task-id` là rơi về form tương tác — mà chạy headless thì không ai trả lời form được, kết quả là session bypass, mất sạch memory. Nên mỗi việc giao cho agent phải có một Task trong Hub trước.

### 7. MemoryKnowledge cũng phải chạy Node 22

Khác lý do với proxy. `better-sqlite3@11.10` **không có prebuild cho Node 24**,
nên npm rơi vào biên dịch bằng node-gyp — mà máy không có build toolchain.

Chỗ độc là **npm vẫn báo `exit 0`**: lần cài đầu ra 261 package, nhìn như thành
công, nhưng `node_modules/.bin/` không tồn tại và service không khởi động được
với `tsx: not found`. Lỗi thật (`gyp ERR! not ok`) nằm sâu trong output.

Chạy bằng Node 22 thì npm tải prebuild, không biên dịch gì cả. Dùng
`~/knowledge-node22.sh` (tự `nvm use 22`), và script có bước tự kiểm:

```bash
node -e "require('better-sqlite3')"
```

Đừng tin `exit 0` của npm khi có native module — kiểm tra `node_modules/.bin/`
tồn tại và nạp thử module.

---

## Kiểm tra nhanh cả chuỗi

```bash
bash tools/check-stack.sh
```

Kỳ vọng: cả bốn dịch vụ `200`, và hai probe agent tự nói đúng tên agent + task của mình.
