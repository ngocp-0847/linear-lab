# Quy ước code

Đọc trước khi viết dòng đầu tiên. Đây cũng là nội dung sẽ được chưng cất thành **Skill** cho agent Builder — nên viết ở dạng "làm thế này", không phải "nên cân nhắc".

## Bố cục monorepo

```
apps/
  api/        Hono server, cổng 3001
  web/        React + Vite, cổng 3000, proxy /api → 3001
packages/
  db/         Drizzle schema + client + migration
  shared/     Kiểu dữ liệu, zod schema, sort-key — dùng chung api và web
tools/
  anthropic-shim/   dịch giao thức cho hạ tầng agent, KHÔNG phải của sản phẩm
  orchestrator/     điều phối agent, KHÔNG phải của sản phẩm
```

Quy tắc phụ thuộc, một chiều:

```
web ──► shared ◄── api ──► db ──► shared
```

`shared` **không được** import từ `db`, `api`, hay `web`. Nó chỉ chứa thứ thuần: kiểu, zod schema, hàm không tác dụng phụ. Vi phạm chiều này là hỏng build của web (kéo theo driver Postgres vào bundle trình duyệt).

## TypeScript

- `strict: true`, cộng `noUncheckedIndexedAccess`
- Không dùng `any`. Chưa biết kiểu thì `unknown` rồi thu hẹp dần.
- Không dùng `as` để ép kiểu, trừ khi kèm comment giải thích vì sao an toàn
- Export kiểu bằng `export type`, giá trị bằng `export`. Bật `verbatimModuleSyntax`.
- Import trong monorepo dùng đường dẫn package (`@lab/shared`), không dùng `../../..`

## Đặt tên

| Loại | Quy ước | Ví dụ |
| --- | --- | --- |
| File | kebab-case | `issue-service.ts` |
| Component React | PascalCase, một component một file | `IssueRow.tsx` |
| Hàm/biến | camelCase | `moveIssue` |
| Kiểu/interface | PascalCase, không tiền tố `I` | `Issue`, không `IIssue` |
| Hằng | SCREAMING_SNAKE | `MAX_TITLE_LENGTH` |
| Cột DB | snake_case | `assignee_id` |

Drizzle map `snake_case` ↔ `camelCase` ở tầng schema. Code TypeScript **không bao giờ** thấy snake_case.

## Cấu trúc tầng ở api

```
apps/api/src/
  index.ts          bootstrap server
  routes/           chỉ HTTP: parse, validate, gọi service, đóng gói response
  services/         toàn bộ nghiệp vụ + transaction
  lib/              tiện ích
```

Ranh giới cứng: **route không được đụng thẳng vào db.** Mọi truy vấn nằm trong service. Lý do không phải thẩm mỹ — tác dụng phụ như `completed_at` phải ở đúng một chỗ, và transaction phải bao trọn nghiệp vụ chứ không bao trọn một câu HTTP.

## Zod

Schema khai báo ở `packages/shared/src/schemas/`, dùng chung hai đầu.

```ts
// shared
export const createIssueSchema = z.object({
  title: z.string().trim().min(1).max(500),
  estimate: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(5), z.literal(8)]).nullable().optional(),
});
export type CreateIssueInput = z.infer<typeof createIssueSchema>;
```

Api validate ở biên route. Web validate trước khi gửi. Cùng một schema nên không lệch nhau được.

## Test

Vitest. Chạy `npm test` ở gốc là chạy hết mọi workspace.

Bắt buộc có test cho:

1. **Sáu ràng buộc bất biến** ở [10-domain-model](10-domain-model.md) — mỗi cái ít nhất một test
2. **`sort-key`** — `between()` phải luôn sinh ra khoá nằm đúng giữa, kể cả khi chèn liên tiếp 1000 lần vào cùng một khe
3. **Cấp identifier** — tạo song song 50 issue phải ra 50 số khác nhau, không trùng
4. **Tác dụng phụ `completed_at`** — vào/rời `done` và `canceled`

Không cần test cho getter thuần hay component chỉ render tĩnh.

Đặt test cạnh file nguồn: `issue-service.ts` → `issue-service.test.ts`.

## Migration

Drizzle Kit. Không sửa file migration đã commit. Đổi schema thì sinh migration mới:

```bash
npm run db:generate -w @lab/db
npm run db:migrate  -w @lab/db
```

Migration phải chạy được cả chiều tiến. v1 không cần rollback script, nhưng đừng viết migration mất dữ liệu mà không có bước sao lưu.

## Git

- Commit theo Conventional Commits: `feat:` `fix:` `refactor:` `test:` `docs:` `chore:`
- Một commit một thay đổi logic. Không gộp "sửa 3 bug + đổi format".
- Không commit `.env`, `node_modules`, `dist`, dữ liệu Postgres

## Những thứ cấm

Ghi rõ vì đây là các lối tắt hay bị chọn khi vội:

1. **Cấm `addEventListener("keydown")` rải rác trong component.** Đăng ký ở `keyboard/registry.ts`.
2. **Cấm lưu giá trị tính được** (tiến độ project, số issue). Tính lúc đọc.
3. **Cấm đọc-rồi-ghi để cấp số.** Dùng `UPDATE ... RETURNING` một câu.
4. **Cấm `SELECT *` rồi lọc ở JS** khi có thể lọc bằng SQL.
5. **Cấm bắt lỗi rồi nuốt im.** Không xử lý được thì để nó nổi lên; xử lý được thì log lý do.
6. **Cấm import `@lab/db` từ `apps/web`.**
