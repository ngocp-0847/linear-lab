/**
 * Gom mọi thứ sidebar cần vào một lần đọc, thay vì 6 request song song.
 * Route không được đụng thẳng vào db — mọi truy vấn nằm ở tầng này.
 */
import { asc } from "drizzle-orm";
import type { Db } from "@lab/db";
import { cycle, label, project, state, team, user } from "@lab/db";
import type { Bootstrap, State, StateCategory, StateKey } from "@lab/shared";

export async function getBootstrap(db: Db): Promise<Bootstrap> {
  const [teams, states, labels, users, projects, cycles] = await Promise.all([
    db.select().from(team).limit(1),
    db.select().from(state).orderBy(asc(state.position)),
    db.select().from(label).orderBy(asc(label.name)),
    db.select().from(user).orderBy(asc(user.name)),
    db.select().from(project).orderBy(asc(project.name)),
    db.select().from(cycle).orderBy(asc(cycle.number)),
  ]);

  const t = teams[0];
  if (!t) throw new Error("chưa seed dữ liệu — chạy `npm run db:seed`");

  return {
    team: { id: t.id, name: t.name, key: t.key },
    states: states.map((s): State => ({
      id: s.id,
      key: s.key as StateKey,
      name: s.name,
      category: s.category as StateCategory,
      position: s.position,
      color: s.color,
    })),
    labels,
    users,
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      status: p.status as Bootstrap["projects"][number]["status"],
      targetDate: p.targetDate,
    })),
    cycles: cycles.map((c) => ({
      id: c.id, number: c.number, name: c.name, startsAt: c.startsAt, endsAt: c.endsAt,
    })),
  };
}
