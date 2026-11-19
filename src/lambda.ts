import { Hono } from "hono";
import { handle } from "@hono/aws-lambda";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer } from "./tools";
import { api, linkBase } from "./api";
import { confirmWatch, unsubscribeWatch } from "./watchService";
import { askPage, confirmedPage, invalidLinkPage, unsubscribedPage } from "./watchPages";

export const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));

// MCP for Claude. Confirm links in emails point to the website when SITE_URL is set.
app.all("/mcp", async (c) => {
  const server = createServer({ baseUrl: linkBase(c.req.url) });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

// JSON API for the website: /api/suggest, /api/check, /api/recent, /api/watch...
app.route("/api", api);

// ---------- the links in emails ----------
// With SITE_URL set, these send people to the website's pages (emails already sent keep working).
// Without it, the Lambda shows its own simple pages: GET shows a button, POST does the action.

const site = () => process.env.SITE_URL?.replace(/\/$/, "");

app.get("/watch/:action{confirm|unsubscribe}", (c) => {
  const action = c.req.param("action") as "confirm" | "unsubscribe";
  const token = c.req.query("token") ?? "";
  const s = site();
  if (s) return c.redirect(`${s}/watch/${action}?token=${encodeURIComponent(token)}`, 302);
  return c.html(askPage(action, token));
});

app.post("/watch/confirm", async (c) => {
  const form = await c.req.parseBody();
  const result = await confirmWatch(String(form.token ?? ""));
  return result.ok ? c.html(confirmedPage(result.email!, result.medicines ?? [])) : c.html(invalidLinkPage(), 400);
});

app.post("/watch/unsubscribe", async (c) => {
  const form = await c.req.parseBody();
  const result = await unsubscribeWatch(String(form.token ?? ""));
  return result.ok ? c.html(unsubscribedPage(result.email!)) : c.html(invalidLinkPage(), 400);
});

export const handler = handle(app);
