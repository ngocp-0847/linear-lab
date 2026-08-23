# Linear Lab — tổng quan sản phẩm

Công cụ quản lý dự án kiểu Linear: theo dõi issue, gom vào project và cycle, thao tác bằng bàn phím.

## Nguyên tắc sản phẩm

Bốn điều này quyết định mọi tranh cãi thiết kế về sau. Khi phân vân, quay lại đây.

1. **Bàn phím trước, chuột sau.** Mọi hành động thường dùng phải làm được không cần chuột. Command palette (`Cmd/Ctrl+K`) là đường vào chính, không phải tính năng phụ.
2. **Phản hồi tức thì.** Mọi thay đổi cập nhật UI ngay rồi mới gọi API (optimistic). Lỗi thì hoàn tác và báo. Không có spinner cho thao tác sửa một trường.
3. **Ít trạng thái, rõ ràng.** Không tự chế thêm status. Vòng đời issue là một máy trạng thái đóng, xem [20-api-and-states](20-api-and-states.md).
4. **Không có xoá mềm nửa vời.** Issue bị xoá là xoá thật; muốn giữ thì dùng trạng thái `canceled`. Tránh hai khái niệm chồng nhau.

## Trong phạm vi v1

| Nhóm | Nội dung |
| --- | --- |
| Issue | tạo/sửa/xoá, title, description (markdown), priority, estimate, assignee, label, thứ tự trong cột |
| Trạng thái | máy trạng thái 6 bước, chuyển bằng bàn phím |
| Project | gom issue theo mục tiêu, có tiến độ |
| Cycle | chu kỳ theo thời gian (kiểu sprint), issue thuộc tối đa một cycle |
| Label | gắn nhiều nhãn cho issue, có màu |
| Comment | bình luận phẳng trên issue, markdown |
| View | danh sách + bảng kanban, lọc và nhóm |
| Command palette | `Cmd+K`, tìm và chạy lệnh, điều hướng |

## Ngoài phạm vi v1

Ghi rõ để khỏi bị kéo phạm vi giữa chừng:

- Real-time nhiều người cùng sửa (không websocket ở v1)
- Sub-issue, issue phụ thuộc nhau
- Roadmap, milestone nhiều quý
- Tích hợp GitHub/Slack
- Thông báo, email
- Nhiều workspace / phân quyền theo vai trò
- Đính kèm file
- Tìm kiếm toàn văn nâng cao (v1 chỉ `ILIKE` trên title)

Không phải "không bao giờ làm" — chỉ là không phải bây giờ. Ai thấy cần thì viết ADR trong [../adr](../adr) trước.

## Thuật ngữ

| Từ | Nghĩa trong hệ này |
| --- | --- |
| **Issue** | Đơn vị công việc nhỏ nhất. Mọi thứ khác chỉ là cách gom issue lại. |
| **Identifier** | Mã người đọc được, dạng `LAB-42`. Sinh tự động, không đổi, không tái sử dụng. |
| **Project** | Nhóm issue hướng tới một mục tiêu. Không có thời hạn cứng. |
| **Cycle** | Khoảng thời gian cố định (mặc định 2 tuần). Có ngày bắt đầu/kết thúc. |
| **State** | Một trong sáu trạng thái vòng đời. Xem [20-api-and-states](20-api-and-states.md). |
| **Estimate** | Điểm ước lượng theo thang Fibonacci: 1, 2, 3, 5, 8. Không dùng giờ. |

## Bản đồ tài liệu

- [10-domain-model](10-domain-model.md) — thực thể, quan hệ, ràng buộc bất biến
- [20-api-and-states](20-api-and-states.md) — máy trạng thái và bề mặt API
- [30-ui-and-shortcuts](30-ui-and-shortcuts.md) — màn hình, command palette, phím tắt
- [50-conventions](50-conventions.md) — quy ước code, bắt buộc đọc trước khi viết dòng đầu tiên
