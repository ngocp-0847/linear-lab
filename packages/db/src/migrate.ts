/** Chạy migration Drizzle lên PGlite (hoặc Postgres nếu có DATABASE_URL). */
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "./client.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const db = createDb();
await migrate(db, { migrationsFolder: path.resolve(here, "../migrations") });
console.log("migration xong");
process.exit(0);
