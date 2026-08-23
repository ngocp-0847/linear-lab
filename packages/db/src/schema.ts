/**
 * Schema Postgres. Nguồn sự thật về HIỆN TRẠNG dữ liệu;
 * ý định thiết kế nằm ở docs/spec/10-domain-model.md — lệch nhau thì sửa cả hai.
 *
 * Quy ước: cột snake_case dưới DB, thuộc tính camelCase trong TS. Code
 * TypeScript không bao giờ nhìn thấy snake_case.
 */
import { relations } from "drizzle-orm";
import {
  check, date, index, integer, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const team = pgTable("team", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  key: text("key").notNull().unique(),
  /** Số cuối đã cấp. Tăng bằng UPDATE ... RETURNING, không đọc-rồi-ghi. */
  issueCounter: integer("issue_counter").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const user = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  avatarColor: text("avatar_color").notNull(),
});

export const state = pgTable("state", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id").notNull().references(() => team.id, { onDelete: "cascade" }),
  /** Cố định: code so sánh theo key, không theo name. */
  key: text("key").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  position: integer("position").notNull(),
  color: text("color").notNull(),
}, (t) => ({
  uniqKey: uniqueIndex("state_team_key_uniq").on(t.teamId, t.key),
}));

export const project = pgTable("project", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id").notNull().references(() => team.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("planned"),
  targetDate: date("target_date"),
});

export const cycle = pgTable("cycle", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id").notNull().references(() => team.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  name: text("name"),
  startsAt: date("starts_at").notNull(),
  endsAt: date("ends_at").notNull(),
}, (t) => ({
  uniqNum: uniqueIndex("cycle_team_number_uniq").on(t.teamId, t.number),
}));

export const label = pgTable("label", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id").notNull().references(() => team.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull(),
}, (t) => ({
  uniqName: uniqueIndex("label_team_name_uniq").on(t.teamId, t.name),
}));

export const issue = pgTable("issue", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id").notNull().references(() => team.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  /** `${team.key}-${number}`. Không bao giờ đổi, không tái sử dụng. */
  identifier: text("identifier").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  stateId: uuid("state_id").notNull().references(() => state.id),
  priority: smallint("priority").notNull().default(0),
  estimate: smallint("estimate"),
  assigneeId: uuid("assignee_id").references(() => user.id, { onDelete: "set null" }),
  projectId: uuid("project_id").references(() => project.id, { onDelete: "set null" }),
  cycleId: uuid("cycle_id").references(() => cycle.id, { onDelete: "set null" }),
  /** Khoá phân đoạn dạng chuỗi — xem @lab/shared sort-key. */
  sortKey: text("sort_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  /** Đồng bộ với category của state — ràng buộc bất biến #2. */
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => ({
  uniqNumber: uniqueIndex("issue_team_number_uniq").on(t.teamId, t.number),
  byBoard: index("issue_board_idx").on(t.teamId, t.stateId, t.sortKey),
  byAssignee: index("issue_assignee_idx").on(t.assigneeId),
  byProject: index("issue_project_idx").on(t.projectId),
  byCycle: index("issue_cycle_idx").on(t.cycleId),
  // Chặn ở DB chứ không chỉ ở zod — ràng buộc bất biến #4.
  estimateScale: check("issue_estimate_fib", sql`${t.estimate} IS NULL OR ${t.estimate} IN (1,2,3,5,8)`),
  priorityRange: check("issue_priority_range", sql`${t.priority} BETWEEN 0 AND 4`),
}));

export const issueLabel = pgTable("issue_label", {
  issueId: uuid("issue_id").notNull().references(() => issue.id, { onDelete: "cascade" }),
  labelId: uuid("label_id").notNull().references(() => label.id, { onDelete: "cascade" }),
}, (t) => ({
  pk: primaryKey({ columns: [t.issueId, t.labelId] }),
}));

export const comment = pgTable("comment", {
  id: uuid("id").primaryKey().defaultRandom(),
  issueId: uuid("issue_id").notNull().references(() => issue.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").notNull().references(() => user.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byIssue: index("comment_issue_idx").on(t.issueId, t.createdAt),
}));

// ── Quan hệ ─────────────────────────────────────────────────────────────────

export const issueRelations = relations(issue, ({ one, many }) => ({
  state: one(state, { fields: [issue.stateId], references: [state.id] }),
  assignee: one(user, { fields: [issue.assigneeId], references: [user.id] }),
  project: one(project, { fields: [issue.projectId], references: [project.id] }),
  cycle: one(cycle, { fields: [issue.cycleId], references: [cycle.id] }),
  labels: many(issueLabel),
  comments: many(comment),
}));

export const issueLabelRelations = relations(issueLabel, ({ one }) => ({
  issue: one(issue, { fields: [issueLabel.issueId], references: [issue.id] }),
  label: one(label, { fields: [issueLabel.labelId], references: [label.id] }),
}));

export const commentRelations = relations(comment, ({ one }) => ({
  issue: one(issue, { fields: [comment.issueId], references: [issue.id] }),
  author: one(user, { fields: [comment.authorId], references: [user.id] }),
}));
