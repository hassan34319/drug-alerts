// The JSON API for the website (web/). Same logic as the MCP tools, plain HTTP + JSON.
// The Next.js server calls these; the browser never talks to the Lambda directly.

import { Hono } from "hono";
import { z } from "zod";
import { checkByName, recentAlertsCached } from "./service";
import { suggest } from "./suggest";
import { confirmWatch, requestWatch, unsubscribeWatch } from "./watchService";

/** Where links in emails should point: the website when SITE_URL is set, otherwise this server. */
export const linkBase = (requestUrl: string) =>
  (process.env.SITE_URL || new URL(requestUrl).origin).replace(/\/$/, "");

// "a, b ,c" -> ["a","b","c"]
const list = (s?: string) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);

export const api = new Hono();

// Any unexpected failure (FDA down, DynamoDB error) -> 502 with a message, never a crash page.
api.onError((err, c) => {
  console.error("api error:", err);
  return c.json({ error: "upstream_failed", message: err.message }, 502);
});

// GET /api/suggest?q=lip -> { suggestions: ["lipitor", ...] }
api.get("/suggest", async (c) => c.json({ suggestions: await suggest(c.req.query("q") ?? "") }));

// GET /api/check?q=Dilaudid  (or &ingredients=acetaminophen,diphenhydramine after a "choose")
api.get("/check", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 2) return c.json({ error: "bad_request", message: "q must be at least 2 characters" }, 400);
  return c.json(await checkByName(q, list(c.req.query("ingredients"))));
});

// GET /api/recent?days=30&medicines=lipitor,metformin
api.get("/recent", async (c) => {
  const days = Number(c.req.query("days") ?? 7);
  if (!Number.isInteger(days) || days < 1 || days > 90)
    return c.json({ error: "bad_request", message: "days must be a whole number from 1 to 90" }, 400);
  const medicines = list(c.req.query("medicines"));
  return c.json(await recentAlertsCached(days, medicines.length ? medicines : undefined));
});

const WatchBody = z.object({
  email: z.string().max(254),
  medicines: z.array(z.string().min(2).max(100)).min(1).max(20),
});

// POST /api/watch { email, medicines } -> same statuses as the add_to_watchlist tool
api.post("/watch", async (c) => {
  const body = WatchBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "bad_request", message: "email and 1-20 medicines are required" }, 400);
  return c.json(await requestWatch(body.data.email, body.data.medicines, linkBase(c.req.url)));
});

const TokenBody = z.object({ token: z.string().min(10).max(2000) });

// POST /api/watch/confirm { token } and /api/watch/unsubscribe { token } -> { ok, email?, medicines? }
api.post("/watch/confirm", async (c) => {
  const body = TokenBody.safeParse(await c.req.json().catch(() => null));
  return c.json(body.success ? await confirmWatch(body.data.token) : { ok: false });
});

api.post("/watch/unsubscribe", async (c) => {
  const body = TokenBody.safeParse(await c.req.json().catch(() => null));
  return c.json(body.success ? await unsubscribeWatch(body.data.token) : { ok: false });
});
