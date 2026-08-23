# ADR 0002 — Kết quả vòng agent đầu tiên: ký ức KHÔNG tự chảy giữa các agent

**Trạng thái:** ghi nhận · 2026-08-23

## Câu hỏi cần trả lời

Lời hứa trung tâm của TencentDB Agent Memory là *"experience accumulates, flows, and passes on to the next Agent"*. Vòng này kiểm chứng: **Builder có kế thừa được điều Architect vừa quyết định không?**

## Cách đo

1. Architect (Claude Code) chốt ba quyết định cho `POST /api/issues`, trong đó có một con số **tuỳ ý, không có trong spec, không đoán được**: *tối đa 5 label khi tạo issue*.
2. Chờ pipeline chưng cất L0 → L1.
3. Builder (Codex, phiên mới, agent khác) được hỏi đúng ba câu đó.

Chỉ câu về số label mới là tín hiệu thật — `409 Conflict` và header `Location` là quy ước phổ thông, đoán trúng không chứng minh gì.

## Kết quả

**Phần chạy đúng:**

- Cả hai CLI đi qua proxy và đều nhận injection: `hookCount=5, totalBlockCount=4`.
- L0 ghi được: 21 message dưới agent Architect.
- Pipeline chưng cất thành công trong ~10 giây, atom L1 giữ đúng nội dung:
  *"…创建 issue 时允许最多分配 5 个标签"* (bằng tiếng Trung).
- Đã gán `chat_memory` của Architect cho Builder qua `agent-fixed-asset`, tức cơ chế "mượn ký ức" đã bật.

**Phần không chạy:**

Builder trả lời **"Không biết"** đúng câu về số label. Nó đi `git grep` khắp repo rồi kết luận *"con số label thì chưa có nguồn đọc được"*.

## Nguyên nhân

Kiểm tra log proxy, chỉ có đúng 5 hook được đăng ký:

| Hook | Nhồi cái gì |
| --- | --- |
| `skill-injector` / `skill-tools-injector` | danh sách skill (module đang tắt) |
| `knowledge-tools-injector` | **mô tả cách** tra wiki |
| `tdai-memory-tools-injector` | **mô tả cách** curl bộ nhớ |
| `tdai-profile-memory-injector` | chân dung L2/L3 |

**Không hook nào nhồi nội dung L1 vào prompt.** `tdai-l1-recall-injector` tồn tại trong mã nguồn nhưng không nằm trong danh sách chạy.

Đây là **thiết kế có chủ ý**, không phải lỗi — chú thích trong `tdai-tools-injector.ts` nói rõ: L0/L1 không auto-recall mỗi lượt vì nội dung đổi liên tục sẽ phá KV cache của upstream. Chỉ L2/L3 (ổn định) mới được inject thẳng.

Hệ quả: ký ức L1 **chỉ tới được agent nếu chính model chủ động gọi công cụ memory**.

## Chặn thứ hai: sandbox của Codex

Ép Builder dùng `tdai_memory_search`, nó có thử thật — gọi `POST /memory-bridge/v3/atomic/search` qua curl và PowerShell. Cả hai đều bị chặn:

```
rejected: blocked by policy
```

Mở `sandbox_workspace_write.network_access=true` vẫn bị chặn. Ở chế độ `codex exec` không tương tác, policy duyệt lệnh chặn lệnh shell tuỳ ý trước cả khi tới tầng network.

Nghĩa là: con đường duy nhất để L1 tới được agent (gọi tool) **không dùng được với Codex headless**.

## Kết luận

Lời hứa "kinh nghiệm truyền từ agent này sang agent khác" là **có thật nhưng có điều kiện**, và ba điều kiện đó đều không tự thoả:

1. **Cần thời gian.** L1 mất ~10s, nhưng L2/L3 — thứ *duy nhất* được inject thẳng — cần lâu hơn nhiều (ở cấu hình này persona cần 10 lượt hội thoại, L2 tối thiểu 120s giữa hai lần). Một vòng ngắn không kịp sinh ra chúng.
2. **Cần model chủ động tra.** Có mô tả công cụ trong prompt không đảm bảo model dùng. Builder chọn `git grep` — hợp lý với một agent lập trình, và đó chính là vấn đề.
3. **Cần sandbox cho phép.** Công cụ memory được thiết kế dưới dạng "Bash + curl", mà agent coding hiện đại chạy trong sandbox chặn đúng thứ đó.

## Việc nên làm tiếp

- **Đổi `injection_mode` của chat_memory từ `tool` sang `direct`/`summary`** để nội dung được nhồi thẳng thay vì chờ model tra. Đánh đổi prompt cache lấy tính chắc chắn.
- **Chạy nhiều vòng hơn** cho tới khi L2/L3 hình thành, rồi đo lại — đó mới là kênh truyền mà sản phẩm thực sự dựa vào.
- **Với Codex**: hoặc dùng MCP thay vì curl, hoặc chạy ở chế độ cho phép lệnh mạng.

Chưa nên kết luận sản phẩm "không truyền được kinh nghiệm" — mới chỉ chứng minh **nó không truyền tự động trong một vòng ngắn với cấu hình mặc định**.
