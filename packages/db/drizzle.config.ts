import type { Config } from "drizzle-kit";

export default {
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  // PGlite ở dev; đặt DATABASE_URL để trỏ Postgres thật. Xem ADR 0001.
  dbCredentials: { url: process.env.DATABASE_URL ?? "file://../../.pgdata" },
} satisfies Config;
