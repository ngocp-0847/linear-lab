# Giao diện, command palette, phím tắt

React 19 + Vite + TanStack Query + Tailwind. Không dùng thư viện UI component — tự viết, vì cái cần ở đây là điều khiển bàn phím chính xác, mà đó lại là chỗ mọi thư viện đều làm khác nhau một chút.

## Màn hình

| Đường dẫn | Màn hình | Nội dung |
| --- | --- | --- |
| `/` | Chuyển hướng | → `/issues` |
| `/issues` | Danh sách | Bảng dày đặc, nhóm theo state |
| `/board` | Kanban | Cột theo state, kéo thả |
| `/issues/:identifier` | Chi tiết | Toàn màn hình, không phải modal |
| `/projects` · `/projects/:id` | Project | Danh sách + tiến độ |
| `/cycles` · `/cycles/:id` | Cycle | Cycle hiện tại nổi bật |

Sidebar cố định bên trái: điều hướng + bộ lọc lưu sẵn. Thu gọn bằng `[`.

## Nguyên tắc trình bày

Dày, không thoáng. Linear đọc được nhiều issue một màn hình vì hàng cao 32–36px chứ không phải card 80px. Bám theo:

- Hàng issue cao `36px`, padding ngang `12px`
- Cỡ chữ nền `13px`, không phải 16
- Một hàng gồm: priority · identifier · title · label · assignee · estimate
- Màu chỉ dùng để **phân loại**, không để trang trí. State và label có màu; còn lại xám.
- Không đổ bóng. Phân tách bằng đường viền `1px`.

Dark mode là mặc định, light mode có nhưng không phải ưu tiên.

## Command palette

`Cmd+K` / `Ctrl+K`. Đây là đường vào chính của sản phẩm, không phải tính năng phụ — làm cẩn thận.

Hành vi:

- Mở là focus ngay ô nhập, không cần click
- Tìm mờ (fuzzy) trên tên lệnh **và** trên issue (`LAB-42`, một phần title)
- `↑` `↓` di chuyển, `Enter` chạy, `Esc` đóng
- Nhớ lệnh vừa dùng, đẩy lên đầu
- Chạy xong đóng luôn, trừ lệnh có dạng chọn tiếp (ví dụ "Đổi trạng thái →" mở danh sách state)

Nhóm lệnh:

| Nhóm | Ví dụ |
| --- | --- |
| Điều hướng | Tới Issues, Tới Board, Mở project… |
| Tạo | Issue mới, Project mới, Cycle mới |
| Sửa issue đang chọn | Đổi trạng thái, Gán người, Đặt độ ưu tiên, Gắn nhãn, Đặt estimate |
| Xem | Đổi nhóm, Đổi bộ lọc, Bật/tắt sidebar |

## Phím tắt

Tuân theo Linear ở những phím phổ biến — người dùng đã có cơ bắp nhớ sẵn, đừng bắt học lại.

### Toàn cục

| Phím | Hành động |
| --- | --- |
| `Cmd/Ctrl+K` | Command palette |
| `C` | Tạo issue |
| `G` rồi `I` | Tới Issues |
| `G` rồi `B` | Tới Board |
| `G` rồi `P` | Tới Projects |
| `/` | Focus ô tìm |
| `[` | Ẩn/hiện sidebar |
| `?` | Bảng phím tắt |

### Khi có issue được chọn

| Phím | Hành động |
| --- | --- |
| `↑` `↓` hoặc `J` `K` | Di chuyển lựa chọn |
| `Enter` | Mở chi tiết |
| `S` | Đổi trạng thái (mở chọn) |
| `A` | Gán người |
| `P` | Độ ưu tiên |
| `L` | Nhãn |
| `E` | Estimate |
| `Backspace` | Xoá (có xác nhận) |
| `Esc` | Bỏ chọn / đóng |

### Quy tắc cài đặt

1. **Không bắt phím khi đang gõ.** Đang focus `input`/`textarea`/contenteditable thì bỏ qua mọi phím đơn. Chỉ `Esc` và `Cmd+K` xuyên qua.
2. **Chuỗi phím `G` `I` có thời hạn.** Bấm `G` mở cửa sổ chờ 1200ms; hết giờ thì huỷ.
3. **Một nơi đăng ký duy nhất.** Toàn bộ phím tắt khai báo ở `apps/web/src/keyboard/registry.ts`. Cấm rải `addEventListener("keydown")` trong component — đó là con đường chắc chắn dẫn tới phím xung đột mà không ai tìm ra.
4. **Bảng `?` sinh từ registry**, không viết tay. Viết tay là chắc chắn lệch.

## Optimistic update

Mọi thao tác sửa đều cập nhật cache trước rồi mới gọi API.

```
người dùng bấm S → done
  1. sửa ngay cache TanStack Query
  2. gọi PATCH
  3a. ok    → invalidate nhẹ để đồng bộ
  3b. lỗi   → rollback về snapshot + hiện toast "không lưu được"
```

Kéo thả trên board cũng vậy: tính `sort_key` mới ở client bằng đúng hàm `between()` mà server dùng (`packages/shared`), áp ngay, rồi gửi lên. Dùng chung một hàm là điều kiện để client và server không tính ra hai kết quả khác nhau.
