// Tests step 4 with no AWS: the add_to_watchlist MCP tool and the confirm/unsubscribe pages,
// called through the real Hono app with an in-memory watchlist and a fake mailer.
//   npx tsx src/try-routes.ts
process.env.WATCH_SECRET ??= "test-secret-test-secret-test-secret-1234";
import { app } from "./lambda";
import { setWatchStore, memoryWatchStore } from "./watchlist";
import { setMailer, type Email } from "./email";

const store = memoryWatchStore();
setWatchStore(store);
const outbox: Email[] = [];
setMailer(async (e) => void outbox.push(e));
const BASE = "https://fake-lambda.example";

// Call the MCP endpoint the way Claude does: a JSON-RPC "tools/call" POST.
async function callTool(name: string, args: unknown) {
  const res = await app.request(`${BASE}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const body = (await res.json()) as any;
  return JSON.parse(body.result.content[0].text);
}
const list = await app.request(`${BASE}/mcp`, {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
});
console.log("tools:", ((await list.json()) as any).result.tools.map((t: any) => t.name));

console.log("1 tool, unclear name:", (await callTool("add_to_watchlist", { email: "me@x.com", medicines: ["tylenol"] })).status);
console.log("2 tool, good:", await callTool("add_to_watchlist", { email: "me@x.com", medicines: ["metoprolol tartrate"] }));

const link = outbox[0].text.match(/https:\S+\/watch\/confirm\?token=\S+/)![0];
console.log("3 link in email starts with our address:", link.startsWith(`${BASE}/watch/confirm?token=`));
const token = new URL(link).searchParams.get("token")!;

const get = await app.request(link);
console.log("4 GET shows button, still pending:", get.status, (await get.text()).includes("<button"), store.all.get("me@x.com")!.status);

const form = (t: string) => ({ method: "POST", body: new URLSearchParams({ token: t }) });
const bad = await app.request(`${BASE}/watch/confirm`, form(token + "x"));
console.log("5 POST bad token:", bad.status, (await bad.text()).includes("valid"));
const ok = await app.request(`${BASE}/watch/confirm`, form(token));
console.log("6 POST confirm:", ok.status, (await ok.text()).includes("subscribed"), store.all.get("me@x.com")!.status);

console.log("7 tool again:", await callTool("add_to_watchlist", { email: "me@x.com", medicines: ["fludrocortisone"] }));

const { makeToken } = await import("./tokens");
const un = await app.request(`${BASE}/watch/unsubscribe`, form(makeToken("me@x.com", "unsubscribe")));
console.log("8 POST unsubscribe:", un.status, (await un.text()).includes("unsubscribed"), store.all.get("me@x.com")!.status);
console.log("emails sent:", outbox.length);
