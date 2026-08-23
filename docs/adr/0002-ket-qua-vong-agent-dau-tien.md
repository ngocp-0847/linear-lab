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

## Bổ sung sau khi L2/L3 đã hình thành

Lần đo đầu chạy quá sớm — Architect chưa kịp có L2/L3. Chờ tới khi có rồi đo lại,
kết quả **khác về cơ chế nhưng giống về kết cục**, và lần này thấy rõ vì sao.

Bảo Builder tự đọc system prompt của chính nó, nó báo có **2 thẻ agent**:

```
role=self            agent_id=agt-hp0wmc5vec   (của chính Builder)
role=imported_from   agent_id=agt-hp0wxenvoe   (của Architect)
```

**Cơ chế mượn ký ức chạy đúng.** Ký ức của Architect có mặt trong prompt của
Builder. Nhưng Builder vẫn trả lời "không biết", và nó nói chính xác lý do:
phần đó *"có nhắc tới giới hạn label nhưng không nêu con số cụ thể"*.

Truy ngược từng tầng thì thấy con số 5 bị bào mòn dần:

| Tầng | Giữ được gì | Có được inject không |
| --- | --- | --- |
| L0 | *"tối đa 5 label"* — nguyên văn | không |
| L1 | *"最多分配 5 个标签"* — vẫn đủ số | **không bao giờ** |
| L2 | *"…including tag assignment limits"* — mất số | chỉ **chỉ mục**, không toàn văn |
| L3 | chân dung tính cách + chỉ mục scene | có, toàn văn |

Nên kết luận chính xác là: **hệ thống truyền được *chủ đề*, không truyền được
*chi tiết*.** Tầng giữ nguyên sự thật (L1) là tầng không bao giờ được nhồi;
tầng được nhồi (L3) là bản tóm tắt đã trừu tượng hoá.

Agent được cho biết "có tồn tại quyết định về giới hạn label" cùng công cụ để
đọc chi tiết — và đúng lời gọi công cụ đó là thứ sandbox của Codex chặn.

## Việc nên làm tiếp

Đổi `injection_mode` sang `direct` **không giải quyết được** — đã thử, binding
vốn đã là `direct` và nội dung vẫn bị bào mòn ở tầng chưng cất chứ không phải
tầng nhồi. Ba hướng còn thực sự có tác dụng:

- **Đừng dựa vào chưng cất tự động cho dữ kiện chính xác.** Quyết định cần
  chính xác thì ghi thẳng vào Wiki (nơi giữ nguyên văn) chứ đừng để nó chỉ tồn
  tại trong hội thoại. Chưng cất hợp với *bối cảnh* và *thói quen*, không hợp
  với *con số*.
- **Sửa đường tool cho Codex.** Công cụ memory được mô tả dưới dạng
  "Bash + curl", mà `codex exec` chặn lệnh shell tuỳ ý. Dùng MCP server thay
  cho curl thì agent gọi được.
- **Chạy nhiều vòng hơn** rồi đo lại — L2/L3 giàu lên theo thời gian, có thể
  tới lúc nào đó chi tiết được giữ lại. Chưa kiểm chứng.

Không kết luận sản phẩm "không truyền được kinh nghiệm". Kết luận đúng là:
**nó truyền chủ đề chứ không truyền chi tiết, và cầu nối để lấy chi tiết
(gọi tool) hiện không dùng được với Codex headless.**
