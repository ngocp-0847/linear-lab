# Máy trạng thái và bề mặt API

## Vòng đời issue

Sáu trạng thái, gom vào bốn nhóm (`category`) dùng để tính tiến độ.

```
                 ┌──────────────────────────────────────┐
                 ▼                                      │
  backlog ──► todo ──► in_progress ──► in_review ──► done
     │          │           │              │
     └──────────┴───────────┴──────────────┴──────► canceled
                            ▲                            │
                            └────────────────────────────┘
```

| Key | Category | Ý nghĩa |
| --- | --- | --- |
| `backlog` | `unstarted` | Đã ghi nhận, chưa cam kết làm |
| `todo` | `unstarted` | Đã cam kết, chưa bắt đầu |
| `in_progress` | `started` | Đang làm |
| `in_review` | `started` | Chờ review |
| `done` | `completed` | Xong |
| `canceled` | `canceled` | Bỏ, không làm nữa |

### Quy tắc chuyển

**Cho phép mọi chuyển đổi.** Đây là lựa chọn có chủ ý, không phải lười: công cụ quản lý việc mà chặn đường thì người dùng sẽ lách bằng cách tạo issue mới, và dữ liệu còn tệ hơn. Thứ tự trong sơ đồ là *gợi ý luồng thường gặp*, không phải rào chắn.

Nhưng có **tác dụng phụ bắt buộc**:

| Chuyển | Tác dụng phụ |
| --- | --- |
| vào category `completed` | `completed_at = now()` |
| rời category `completed` | `completed_at = null` |
| vào `canceled` | `completed_at = null` |

Đây là ràng buộc bất biến số 2 ở [10-domain-model](10-domain-model.md). Cài ở tầng service, một chỗ duy nhất, không rải rác trong từng handler.

## Bề mặt API

Hono, prefix `/api`. JSON vào và ra. Không versioning ở v1 — chưa có client ngoài.

### Quy ước chung

Mọi response bọc trong envelope:

```jsonc
{ "data": <payload> }                                  // 200
{ "error": { "code": "not_found", "message": "..." } } // 4xx/5xx
```

Mã lỗi: `bad_request` · `not_found` · `conflict` · `internal`.

Phân trang dùng cursor, không dùng offset (offset lệch khi dữ liệu đổi giữa chừng):

```jsonc
{ "data": { "items": [...], "nextCursor": "..." | null } }
```

Validate mọi input bằng zod ở biên. Schema dùng chung với web qua `packages/shared`.

### Issue

| Method | Path | Ghi chú |
| --- | --- | --- |
| `GET` | `/api/issues` | Lọc: `stateId` `assigneeId` `projectId` `cycleId` `labelId` `q`. Sắp theo `sort_key`. |
| `POST` | `/api/issues` | Cấp identifier + `sort_key` cuối cột |
| `GET` | `/api/issues/:idOrIdentifier` | Nhận cả uuid lẫn `LAB-42` |
| `PATCH` | `/api/issues/:id` | Sửa từng phần; chỉ áp field có mặt trong body |
| `DELETE` | `/api/issues/:id` | Xoá cứng, cascade |
| `POST` | `/api/issues/:id/move` | `{ stateId, beforeId?, afterId? }` — đổi cột và/hoặc vị trí |

`move` tách riêng khỏi `PATCH` vì nó phải tính `sort_key` và chạy tác dụng phụ `completed_at` trong **một transaction**. Gộp vào PATCH sẽ khiến hai đường code cùng sửa thứ tự.

### Comment

| Method | Path |
| --- | --- |
| `GET` | `/api/issues/:id/comments` |
| `POST` | `/api/issues/:id/comments` |
| `PATCH` | `/api/comments/:id` |
| `DELETE` | `/api/comments/:id` |

### Project · Cycle · Label

CRUD chuẩn: `GET /api/projects`, `POST`, `GET /:id`, `PATCH /:id`, `DELETE /:id`. Tương tự `/api/cycles`, `/api/labels`.

Thêm:

| Method | Path | Ghi chú |
| --- | --- | --- |
| `GET` | `/api/projects/:id/progress` | `{ total, completed, started, percent }` — tính live, không lưu |
| `GET` | `/api/cycles/current` | Cycle chứa hôm nay, hoặc `null` |
| `POST` | `/api/issues/:id/labels` | `{ labelId }` |
| `DELETE` | `/api/issues/:id/labels/:labelId` | |

### Bootstrap

| Method | Path | Ghi chú |
| --- | --- | --- |
| `GET` | `/api/bootstrap` | Trả team + states + labels + users + projects + cycles trong một lần |

Web gọi đúng một lần lúc khởi động. Tránh 6 request song song chỉ để vẽ được cái sidebar.

## Xử lý lỗi

- Không bắt được entity → `404 not_found`, không phải 200 với `data: null`
- Vi phạm bất biến (estimate sai thang, cycle chồng ngày) → `409 conflict`, message nói rõ vi phạm cái gì
- Zod fail → `400 bad_request`, kèm đường dẫn field lỗi
- Lỗi không lường trước → `500 internal`, log đầy đủ ở server, **không** trả stack ra client
