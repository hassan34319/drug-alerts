// Run the HTTP version of the server on your Mac, exactly as Lambda will run it:
//   npm run http          (then point the Inspector at http://localhost:3000/mcp, transport "Streamable HTTP")
// Add CACHE_TABLE=fda-drug-alert-cache AWS_PROFILE=fda AWS_REGION=ap-southeast-2 in front to use the real cache.
import { serve } from "@hono/node-server";
import { app } from "./lambda";

const port = Number(process.env.PORT ?? 3000);

// @hono/node-server turns Node's built-in H
// TTP server into something that speaks Hono's Request/Response.
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`fda-drug-alert HTTP server on http://localhost:${info.port}`);
  console.log(`  MCP endpoint: http://localhost:${info.port}/mcp`);
  console.log(`  health check: http://localhost:${info.port}/health`);
});
