/**
 * Seed dữ liệu tối thiểu: 1 team, 6 state, vài user/label/issue mẫu.
 * Chạy lại được nhiều lần — xoá sạch trước khi ghi.
 */
import { sequence } from "@lab/shared";
import { createDb } from "./client.js";
import { comment, cycle, issue, issueLabel, label, project, state, team, user } from "./schema.js";

const STATES = [
  { key: "backlog", name: "Backlog", category: "unstarted", color: "#8b8f98" },
  { key: "todo", name: "Todo", category: "unstarted", color: "#e2e2e2" },
  { key: "in_progress", name: "In Progress", category: "started", color: "#f2c94c" },
  { key: "in_review", name: "In Review", category: "started", color: "#5e6ad2" },
  { key: "done", name: "Done", category: "completed", color: "#5e9e6e" },
  { key: "canceled", name: "Canceled", category: "canceled", color: "#6b6f76" },
] as const;

const db = createDb();

// Xoá theo thứ tự ngược phụ thuộc để không vướng khoá ngoại.
for (const t of [comment, issueLabel, issue, label, cycle, project, state, user, team]) {
  await db.delete(t);
}

const [tm] = await db.insert(team).values({ name: "Linear Lab", key: "LAB" }).returning();
if (!tm) throw new Error("không tạo được team");

const states = await db
  .insert(state)
  .values(STATES.map((s, i) => ({ ...s, teamId: tm.id, position: i })))
  .returning();

const users = await db
  .insert(user)
  .values([
    { name: "Ngoc", email: "ngoc@lab.local", avatarColor: "#5e6ad2" },
    { name: "Architect", email: "architect@lab.local", avatarColor: "#f2c94c" },
    { name: "Builder", email: "builder@lab.local", avatarColor: "#5e9e6e" },
  ])
  .returning();

const labels = await db
  .insert(label)
  .values([
    { teamId: tm.id, name: "bug", color: "#eb5757" },
    { teamId: tm.id, name: "feature", color: "#5e6ad2" },
    { teamId: tm.id, name: "chore", color: "#8b8f98" },
  ])
  .returning();

const backlog = states.find((s) => s.key === "backlog")!;
const todo = states.find((s) => s.key === "todo")!;

const samples = [
  { title: "Dựng command palette", stateId: todo.id, priority: 2, estimate: 5 },
  { title: "Kanban kéo thả giữ đúng thứ tự", stateId: todo.id, priority: 1, estimate: 8 },
  { title: "Trang chi tiết issue", stateId: backlog.id, priority: 3, estimate: 3 },
];
const keys = sequence(samples.length);

for (const [i, s] of samples.entries()) {
  // Cấp số bằng UPDATE ... RETURNING, đúng cách chống race đã nêu trong spec.
  const [bumped] = await db
    .update(team)
    .set({ issueCounter: tm.issueCounter + i + 1 })
    .returning({ n: team.issueCounter });
  const n = bumped!.n;
  await db.insert(issue).values({
    teamId: tm.id,
    number: n,
    identifier: `${tm.key}-${n}`,
    title: s.title,
    stateId: s.stateId,
    priority: s.priority,
    estimate: s.estimate,
    assigneeId: users[0]!.id,
    sortKey: keys[i]!,
  });
}

console.log(`seed xong: team ${tm.key}, ${states.length} state, ${users.length} user, ${labels.length} label, ${samples.length} issue`);
process.exit(0);
