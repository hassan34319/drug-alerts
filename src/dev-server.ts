// The whole API on your Mac with NO AWS: in-memory watchlist, emails printed to the terminal instead of sent.
// Use it while working on the website:
//   npx tsx src/dev-server.ts        (API on http://localhost:3001)
//   then in web/: FDA_API_URL=http://localhost:3001 npm run dev
// FDA data is real (fetched live); nothing is cached or stored between restarts.
process.env.WATCH_SECRET ??= "dev-secret-dev-secret-dev-secret-0000";
process.env.SITE_URL ??= "http://localhost:3000"; // links in printed emails point at the local website

import { serve } from "@hono/node-server";
import { app } from "./lambda";
import { memoryWatchStore, setWatchStore } from "./watchlist";
import { setMailer } from "./email";

setWatchStore(memoryWatchStore());
setMailer(async (e) => console.log(`\n---- email to ${e.to}: ${e.subject}\n${e.text}\n----`));

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port }, (i) => console.log(`dev API (no AWS) on http://localhost:${i.port}`));
