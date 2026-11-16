import { Hono } from "hono";
import { handle } from "@hono/aws-lambda";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer } from "./tools";

export const app = new Hono();

app.get("/health", (c) => c.json({ ok: true })); // a quick "is it alive?" check

app.all("/mcp", async (c) => {
  const server = createServer(); // fresh server per request (stateless)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // undefined = stateless mode
    enableJsonResponse: true, // reply with plain JSON, no streaming
  });
  await server.connect(transport);
  return transport.handleRequest(c.req.raw); // MCP handles the request, gives back a Response
});

export const handler = handle(app);
