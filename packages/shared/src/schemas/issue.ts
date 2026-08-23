import { z } from "zod";

/** Thang Fibonacci, không dùng giờ. Xem spec 10-domain-model §Ràng buộc bất biến #4. */
export const ESTIMATES = [1, 2, 3, 5, 8] as const;
export const estimateSchema = z.union([
  z.literal(1), z.literal(2), z.literal(3), z.literal(5), z.literal(8),
]);

export const PRIORITIES = { NONE: 0, URGENT: 1, HIGH: 2, MEDIUM: 3, LOW: 4 } as const;
export const prioritySchema = z.number().int().min(0).max(4);

export const STATE_KEYS = ["backlog", "todo", "in_progress", "in_review", "done", "canceled"] as const;
export type StateKey = (typeof STATE_KEYS)[number];

export const STATE_CATEGORIES = ["unstarted", "started", "completed", "canceled"] as const;
export type StateCategory = (typeof STATE_CATEGORIES)[number];

/** Nhóm của từng state — dùng để tính tiến độ và quyết định completed_at. */
export const STATE_CATEGORY_BY_KEY: Record<StateKey, StateCategory> = {
  backlog: "unstarted",
  todo: "unstarted",
  in_progress: "started",
  in_review: "started",
  done: "completed",
  canceled: "canceled",
};

export const createIssueSchema = z.object({
  title: z.string().trim().min(1, "title không được rỗng").max(500),
  description: z.string().max(50_000).optional(),
  stateId: z.string().uuid().optional(),
  priority: prioritySchema.optional(),
  estimate: estimateSchema.nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  cycleId: z.string().uuid().nullable().optional(),
  labelIds: z.array(z.string().uuid()).optional(),
});
export type CreateIssueInput = z.infer<typeof createIssueSchema>;

/** PATCH từng phần: chỉ field CÓ MẶT mới được áp. Phân biệt "vắng mặt" với "null". */
export const updateIssueSchema = createIssueSchema.partial().omit({ labelIds: true });
export type UpdateIssueInput = z.infer<typeof updateIssueSchema>;

/**
 * Đổi cột và/hoặc vị trí. Tách khỏi PATCH vì phải tính sort_key và chạy
 * tác dụng phụ completed_at trong cùng một transaction.
 */
export const moveIssueSchema = z.object({
  stateId: z.string().uuid(),
  beforeId: z.string().uuid().nullable().optional(),
  afterId: z.string().uuid().nullable().optional(),
});
export type MoveIssueInput = z.infer<typeof moveIssueSchema>;

export const listIssuesQuerySchema = z.object({
  stateId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  cycleId: z.string().uuid().optional(),
  labelId: z.string().uuid().optional(),
  q: z.string().trim().min(1).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListIssuesQuery = z.infer<typeof listIssuesQuerySchema>;

/** Nhận cả uuid lẫn identifier dạng LAB-42. */
export const issueRefSchema = z.string().refine(
  (v) => /^[0-9a-f-]{36}$/i.test(v) || /^[A-Z]{2,5}-\d+$/.test(v),
  "phải là uuid hoặc identifier dạng LAB-42",
);
