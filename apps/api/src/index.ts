import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { getDb } from "@lab/db";

import { errorResponse, ok } from "./lib/http.js";
import { getBootstrap } from "./services/bootstrap-service.js";

const app = new Hono();
const db = getDb();

app.get("/health", (c) => c.json({ status: "ok" }));

app.get("/api/bootstrap", async (c) => ok(c, await getBootstrap(db)));

app.onError((err, c) => errorResponse(c, err));
app.notFound((c) => c.json({ error: { code: "not_found", message: "không có route này" } }, 404));

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port }, () => console.log(`api  →  http://127.0.0.1:${port}`));
