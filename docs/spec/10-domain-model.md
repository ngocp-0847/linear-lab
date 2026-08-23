# Mô hình dữ liệu

Postgres qua Drizzle. Schema nằm ở `packages/db/src/schema.ts` — file này là nguồn sự thật về *ý định*, còn schema là nguồn sự thật về *hiện trạng*. Lệch nhau thì sửa cả hai.

## Sơ đồ quan hệ

```
team ──┬──< issue >──┬── state        (bắt buộc)
       │             ├── project      (tuỳ chọn)
       │             ├── cycle        (tuỳ chọn)
       │             ├── assignee     (tuỳ chọn → user)
       │             └──< issue_label >── label
       ├──< project
       ├──< cycle
       ├──< label
       └──< state
issue ──< comment >── user
```

Mọi thực thể đều thuộc đúng một `team`. v1 chỉ có một team nhưng cột `team_id` vẫn có từ đầu — thêm sau tốn hơn nhiều.

## Bảng

### `team`

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | uuid pk | |
| `name` | text | "Linear Lab" |
| `key` | text unique | Tiền tố identifier, ví dụ `LAB`. Viết hoa, 2–5 ký tự. |
| `issue_counter` | integer | Số cuối đã cấp. Xem phần cấp identifier bên dưới. |
| `created_at` | timestamptz | |

### `user`

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | uuid pk | |
| `name` | text | |
| `email` | text unique | |
| `avatar_color` | text | Màu hex sinh từ hash email, dùng cho avatar chữ cái |

v1 không có đăng nhập. Có bảng user để gán việc và ghi tác giả comment; người dùng hiện tại lấy từ biến môi trường lúc seed.

### `state`

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | uuid pk | |
| `team_id` | uuid fk | |
| `key` | text | Một trong `backlog` `todo` `in_progress` `in_review` `done` `canceled` |
| `name` | text | Nhãn hiển thị, đổi được |
| `category` | text | `unstarted` \| `started` \| `completed` \| `canceled` — dùng để tính tiến độ |
| `position` | integer | Thứ tự cột trên kanban |
| `color` | text | hex |

State là bảng chứ không phải enum để sau này đổi tên hiển thị được. Nhưng `key` thì cố định — code so sánh theo `key`, không theo `name`.

### `issue`

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | uuid pk | |
| `team_id` | uuid fk | |
| `number` | integer | Số thứ tự trong team |
| `identifier` | text unique | `${team.key}-${number}`, sinh khi tạo, **không bao giờ đổi** |
| `title` | text not null | Không rỗng sau khi trim |
| `description` | text | Markdown, cho phép rỗng |
| `state_id` | uuid fk not null | |
| `priority` | smallint | `0` không đặt · `1` khẩn · `2` cao · `3` trung bình · `4` thấp |
| `estimate` | smallint null | Chỉ nhận 1, 2, 3, 5, 8 hoặc null |
| `assignee_id` | uuid fk null | |
| `project_id` | uuid fk null | |
| `cycle_id` | uuid fk null | |
| `sort_key` | text | Thứ tự trong cột. Xem phần sắp xếp bên dưới. |
| `created_at` / `updated_at` | timestamptz | |
| `completed_at` | timestamptz null | Đặt khi vào state category `completed`, xoá khi rời |

Index: `(team_id, state_id, sort_key)` cho kanban, `(team_id, number)` unique, `(assignee_id)`, `(project_id)`, `(cycle_id)`.

### `project`

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | uuid pk | |
| `team_id` | uuid fk | |
| `name` | text | |
| `description` | text | |
| `status` | text | `planned` \| `active` \| `completed` \| `canceled` |
| `target_date` | date null | |

Tiến độ **không lưu** — tính từ issue mỗi lần đọc. Lưu là sinh ra dữ liệu lệch.

### `cycle`

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | uuid pk | |
| `team_id` | uuid fk | |
| `number` | integer | Đếm tăng trong team |
| `name` | text null | Bỏ trống thì hiển thị "Cycle {number}" |
| `starts_at` / `ends_at` | date | |

Ràng buộc: cycle trong cùng team **không được chồng ngày**. Kiểm ở tầng service, không phải constraint DB (Postgres exclusion constraint làm được nhưng khó migrate).

### `label`

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | uuid pk | |
| `team_id` | uuid fk | |
| `name` | text | unique trong team |
| `color` | text | hex |

### `issue_label`

Bảng nối. `(issue_id, label_id)` là khoá chính kép. Xoá theo cascade cả hai phía.

### `comment`

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | uuid pk | |
| `issue_id` | uuid fk cascade | |
| `author_id` | uuid fk | |
| `body` | text | Markdown, không rỗng |
| `created_at` / `updated_at` | timestamptz | |

Phẳng, không lồng nhau. Muốn thread thì viết ADR.

## Ràng buộc bất biến

Những điều phải luôn đúng. Test phải phủ hết.

1. **Identifier không đổi và không tái sử dụng.** Xoá `LAB-42` rồi thì số 42 mất luôn, issue sau vẫn là 43.
2. **`completed_at` đồng bộ với category của state.** Vào `completed` thì đặt, rời thì xoá về null. Không để lệch.
3. **Issue thuộc tối đa một cycle và tối đa một project.** Muốn nhiều thì dùng label.
4. **`estimate` chỉ nhận 1, 2, 3, 5, 8 hoặc null.** Chặn ở cả zod lẫn DB check constraint.
5. **Cycle cùng team không chồng ngày.**
6. **Xoá issue là xoá cứng**, kéo theo comment và issue_label.

## Cấp identifier

`team.issue_counter` tăng dần. Phải chống race khi tạo đồng thời:

```sql
UPDATE team SET issue_counter = issue_counter + 1
WHERE id = $1 RETURNING issue_counter;
```

Một câu lệnh, khoá hàng, không đọc-rồi-ghi. Đọc trước rồi cộng sẽ cấp trùng số khi có hai request cùng lúc — đây là lỗi kinh điển, đừng mắc.

## Sắp xếp trong cột

`sort_key` là **chuỗi**, không phải số, dùng thuật toán khoá phân đoạn (fractional indexing).

Lý do: kéo thả một issue giữa hai issue khác chỉ được sửa **một** hàng. Dùng số nguyên thì phải đánh số lại cả cột. Với khoá chuỗi, giữa `"a"` và `"b"` luôn chèn được `"an"`, không bao giờ hết chỗ.

Cài đặt ở `packages/shared/src/sort-key.ts`:

- `between(a: string | null, b: string | null): string`
- Sinh mới ở cuối danh sách: `between(last, null)`
- So sánh: so sánh chuỗi thường (`<`), dùng `ORDER BY sort_key` trong SQL

Ràng buộc: chỉ dùng ký tự `[0-9a-z]`, không bao giờ kết thúc bằng `0` (để luôn chèn được vào trước).
