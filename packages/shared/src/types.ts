import type { StateCategory, StateKey } from "./schemas/issue.js";

/** Kiểu dùng chung giữa api và web. KHÔNG import từ @lab/db — xem spec 50-conventions. */

export interface Team { id: string; name: string; key: string }
export interface User { id: string; name: string; email: string; avatarColor: string }

export interface State {
  id: string; key: StateKey; name: string; category: StateCategory;
  position: number; color: string;
}

export interface Label { id: string; name: string; color: string }

export interface Issue {
  id: string;
  number: number;
  identifier: string;
  title: string;
  description: string | null;
  stateId: string;
  priority: number;
  estimate: number | null;
  assigneeId: string | null;
  projectId: string | null;
  cycleId: string | null;
  sortKey: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  labelIds: string[];
}

export interface Comment {
  id: string; issueId: string; authorId: string; body: string;
  createdAt: string; updatedAt: string;
}

export interface Project {
  id: string; name: string; description: string | null;
  status: "planned" | "active" | "completed" | "canceled";
  targetDate: string | null;
}

export interface Cycle {
  id: string; number: number; name: string | null; startsAt: string; endsAt: string;
}

/** Tính lúc đọc, không lưu — xem spec 50-conventions §Những thứ cấm #2. */
export interface ProjectProgress {
  total: number; completed: number; started: number; percent: number;
}

/** Một lần gọi lấy hết thứ sidebar cần, thay vì 6 request song song. */
export interface Bootstrap {
  team: Team; states: State[]; labels: Label[];
  users: User[]; projects: Project[]; cycles: Cycle[];
}

export type ApiOk<T> = { data: T };
export type ApiErr = { error: { code: ApiErrorCode; message: string } };
export type ApiErrorCode = "bad_request" | "not_found" | "conflict" | "internal";
export type Paginated<T> = { items: T[]; nextCursor: string | null };
