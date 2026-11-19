import { Hono } from "hono";
import { handle } from "@hono/aws-lambda";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer } from "./tools";
import { confirmWatch, unsubscribeWatch } from "./watchService";
import { askPage, confirmedPage, invalidLinkPage, unsubscribedPage } from "./watchPages";

export const app = new Hono();

/** This server's own public address, read from the incoming request (e.g. https://xxxx.lambda-url...on.aws). */
const originOf = (url: string) => new URL(url).origin;

app.get("/health", (c) => c.json({ ok: true }));

app.all("/mcp", async (c) => {
  const server = createServer({ baseUrl: originOf(c.req.url) });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

// ---------- the links in emails ----------
// GET  = someone (or a link scanner) opened the link: show a page with a button, change nothing.
// POST = the button was pressed: do the action and show the result.

app.get("/watch/confirm", (c) => c.html(askPage("confirm", c.req.query("token") ?? "")));

app.post("/watch/confirm", async (c) => {
  const form = await c.req.parseBody();
  const result = await confirmWatch(String(form.token ?? ""));
  return result.ok ? c.html(confirmedPage(result.email!, result.medicines ?? [])) : c.html(invalidLinkPage(), 400);
});

app.get("/watch/unsubscribe", (c) => c.html(askPage("unsubscribe", c.req.query("token") ?? "")));

app.post("/watch/unsubscribe", async (c) => {
  const form = await c.req.parseBody();
  const result = await unsubscribeWatch(String(form.token ?? ""));
  return result.ok ? c.html(unsubscribedPage(result.email!)) : c.html(invalidLinkPage(), 400);
});

export const handler = handle(app);
