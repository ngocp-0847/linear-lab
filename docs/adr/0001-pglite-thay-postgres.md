# ADR 0001 — Dùng PGlite thay Postgres server ở môi trường dev

**Trạng thái:** đã chấp nhận · 2026-08-23

## Bối cảnh

Spec chọn Postgres + Drizzle. Máy dev là Windows + WSL2, không có Docker, và
`sudo` trong WSL yêu cầu mật khẩu nên không cài được `postgresql` không tương tác.

## Quyết định

Dev dùng [PGlite](https://pglite.dev) — Postgres biên dịch sang WASM, chạy trong
tiến trình Node, dữ liệu ghi ra thư mục. Drizzle có driver sẵn (`drizzle-orm/pglite`).

Schema, migration và mọi câu SQL vẫn viết cho Postgres thật. Đổi sang server
Postgres chỉ là đổi driver trong `packages/db/src/client.ts`, không đụng schema.

## Vì sao không chọn cách khác

- **SQLite** — cú pháp lệch Postgres (không có `uuid` gen, `timestamptz`, `RETURNING`
  trên `UPDATE` khác). Sẽ phải viết lại khi lên production.
- **Cài Postgres trong WSL** — cần mật khẩu sudo, không tự động hoá được, và
  người khác clone repo về lại vấp đúng chỗ đó.
- **Docker** — máy này không có.

## Hệ quả

- Chạy được ngay sau `npm install`, không cần dịch vụ nền
- PGlite chỉ một kết nối một lúc → không đo được hành vi khi tải đồng thời cao.
  Test cấp identifier song song vẫn chạy đúng vì `UPDATE ... RETURNING` được
  serialise, nhưng đừng dùng môi trường này để kết luận về hiệu năng.
- Muốn dùng Postgres thật: đặt `DATABASE_URL`, client tự chuyển driver.
