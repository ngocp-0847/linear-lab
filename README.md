# Linear Lab

Công cụ quản lý dự án kiểu Linear — **và** một phòng thí nghiệm để hiểu TencentDB Agent Memory dùng đúng chỗ thì được gì.

Hai lớp tách bạch:

- **Sản phẩm** (`apps/`, `packages/`) — issue tracker bàn phím-trước.
- **Hạ tầng agent** (`tools/`, `docs/RUNBOOK.md`) — Claude Code và Codex cùng xây sản phẩm này, chia sẻ một bộ nhớ đội.

Agent DB ở đây **không phải tính năng của sản phẩm**. Nó là hạ tầng của đội làm ra sản phẩm — đúng bài toán mà nó được thiết kế cho.

## Chạy

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

- web → http://localhost:3000
- api → http://localhost:3001

Không cần Docker, không cần Postgres server. Dev dùng PGlite (Postgres biên dịch sang WASM) — xem [ADR 0001](docs/adr/0001-pglite-thay-postgres.md).

> Trên Windows dùng `localhost`, đừng dùng `127.0.0.1`: Vite bind IPv6 nên `127.0.0.1:3000` không tới.

## Bố cục

```
apps/api        Hono :3001 — route mỏng, nghiệp vụ nằm ở services/
apps/web        React + Vite :3000, proxy /api → 3001
packages/db     Drizzle schema + PGlite client + migration + seed
packages/shared kiểu, zod schema, sort-key — dùng chung api và web
tools/          hạ tầng agent, KHÔNG phải sản phẩm
docs/spec/      đặc tả — cũng là nguồn cho Wiki của agent
docs/adr/       quyết định kiến trúc
```

Chiều phụ thuộc một chiều: `web → shared ← api → db → shared`. `shared` không được import ngược — vi phạm là kéo driver Postgres vào bundle trình duyệt.

## Đọc gì trước

| Việc bạn định làm | Đọc |
| --- | --- |
| Hiểu sản phẩm | [docs/spec/00-overview.md](docs/spec/00-overview.md) |
| Sửa schema | [10-domain-model](docs/spec/10-domain-model.md) — có 6 ràng buộc bất biến, test phải phủ hết |
| Thêm endpoint | [20-api-and-states](docs/spec/20-api-and-states.md) |
| Làm UI | [30-ui-and-shortcuts](docs/spec/30-ui-and-shortcuts.md) |
| Viết code | [50-conventions](docs/spec/50-conventions.md) — bắt buộc, có danh sách cấm |
| Đụng hạ tầng agent | [docs/RUNBOOK.md](docs/RUNBOOK.md) |

## Hiện trạng

Khung đã dựng và **chạy được thật**, chưa có tính năng:

- ✅ Monorepo 4 workspace, typecheck sạch
- ✅ Schema 9 bảng, migration chạy trên PGlite, check constraint được DB thực thi
- ✅ `sort-key` phân đoạn — 9 test, gồm chèn 1000 lần liên tiếp vào cùng một khe
- ✅ `GET /api/bootstrap` đi hết tuyến web → proxy → api → DB
- ⬜ Issue CRUD, board, command palette — việc của agent Builder

## Hạ tầng agent

```
Claude Code ──► proxy /claude-code/default ──► shim :8097 ──► OpenAI
Codex ────────► proxy /codex/default ─────────────────────► OpenAI
                     │  inject: memory + skill + knowledge
                     ├─► MemoryCore :8420
                     └─► Memory Hub :8123   (curate bằng tay)
```

Ba agent vai trò trong Hub: **Architect** (thiết kế, ADR) · **Builder** (implement) · **Reviewer** (review, test).

Kiểm tra cả chuỗi:

```bash
npm run check:stack
```

Script không chỉ ping `/health` — nó hỏi thẳng model *"bạn được gán agent nào"* rồi so tên. Injection hỏng là hỏng **im lặng**: request vẫn 200, model vẫn trả lời, chỉ là rỗng ký ức. Ping không phát hiện được.

Sáu cái bẫy khi dựng hạ tầng này ghi ở [docs/RUNBOOK.md](docs/RUNBOOK.md) — tất cả tìm ra bằng cách chạy thật rồi đọc log, không có trong tài liệu gốc.

## Ghi chú

**Chỉ một bản Vite trong cây.** `vitest@2` kéo vite 5; nếu `apps/web` khai vite 6 thì npm cài hai bản, plugin resolve bản này còn config resolve bản kia → lỗi kiểu khó hiểu ở `vite.config.ts`. Đổi version rồi thì phải xoá cả `package-lock.json`, chỉ xoá `node_modules` là lock vẫn ghim bản cũ.
