/**
 * Kết nối DB. Dev dùng PGlite (Postgres WASM, không cần dịch vụ nền);
 * đặt DATABASE_URL để chuyển sang Postgres thật. Xem ADR 0001.
 *
 * Schema và mọi câu SQL viết cho Postgres — đổi driver không phải sửa schema.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as schema from "./schema.js";

export type Db = ReturnType<typeof createDb>;

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DATA_DIR = path.resolve(here, "../../../.pgdata");

/**
 * `dataDir = ":memory:"` cho test — mỗi bộ test một DB sạch, không chạm đĩa.
 */
export function createDb(dataDir: string = process.env.PGLITE_DIR ?? DEFAULT_DATA_DIR) {
  const client = new PGlite(dataDir);
  const db = drizzlePglite(client, { schema });
  return Object.assign(db, { $client: client });
}

let singleton: Db | null = null;

/** Dùng ở api. Test thì gọi thẳng createDb(":memory:") để khỏi dùng chung state. */
export function getDb(): Db {
  singleton ??= createDb();
  return singleton;
}

export { schema };
