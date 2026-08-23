/**
 * Envelope chung cho mọi response. Xem spec 20-api-and-states §Quy ước chung.
 * Không xử lý được thì để lỗi nổi lên tới errorHandler, đừng nuốt im.
 */
import type { Context } from "hono";
import type { ApiErrorCode } from "@lab/shared";

export class ApiError extends Error {
  constructor(readonly code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export const notFound = (what: string) => new ApiError("not_found", `${what} không tồn tại`);
export const conflict = (msg: string) => new ApiError("conflict", msg);
export const badRequest = (msg: string) => new ApiError("bad_request", msg);

const STATUS: Record<ApiErrorCode, 400 | 404 | 409 | 500> = {
  bad_request: 400,
  not_found: 404,
  conflict: 409,
  internal: 500,
};

export const ok = <T>(c: Context, data: T) => c.json({ data });

export function errorResponse(c: Context, err: unknown) {
  if (err instanceof ApiError) {
    return c.json({ error: { code: err.code, message: err.message } }, STATUS[err.code]);
  }
  // Lỗi không lường trước: log đủ ở server, KHÔNG trả stack ra client.
  console.error("[api] lỗi không xử lý:", err);
  return c.json({ error: { code: "internal", message: "lỗi nội bộ" } }, 500);
}
