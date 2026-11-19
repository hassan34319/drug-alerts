// End-to-end test of the watchlist with an in-memory table and a fake mailer, against live FDA data.
process.env.WATCH_SECRET = "test-secret-test-secret-test-secret-1234";
import { setWatchStore, memoryWatchStore } from "./watchlist";
import { requestWatch, confirmWatch, unsubscribeWatch, runDailyCheck } from "./watchService";
import type { Email } from "./email";

const store = memoryWatchStore();
setWatchStore(store);
const outbox: Email[] = [];
const mail = async (e: Email) => void outbox.push(e);
const BASE = "https://example.test";
const tokenFrom = (text: string, path: string) => new URL(text.match(new RegExp(`${BASE}${path}\\?token=\\S+`))![0]).searchParams.get("token")!;
const log = (label: string, v: unknown) => console.log(`\n== ${label}\n`, JSON.stringify(v, null, 1).slice(0, 600));

log("1 bad email", await requestWatch("not-an-email", ["Lopressor"], BASE, mail));
log("2 unclear name", await requestWatch("me@x.com", ["metoprolol", "tylenol"], BASE, mail));
log("3 good request", await requestWatch("Me@X.com ", ["metoprolol tartrate", "fludrocortisone"], BASE, mail));
log("4 repeat within an hour", await requestWatch("me@x.com", ["metoprolol tartrate"], BASE, mail));
console.log("emails so far:", outbox.length, "|", outbox[0]?.subject);

const confirmToken = tokenFrom(outbox[0].text, "/watch/confirm");
log("5 tampered token", await confirmWatch(confirmToken.slice(0, -2) + "xx"));
log("7 confirm", await confirmWatch(confirmToken));
console.log("seeded notified:", store.all.get("me@x.com")!.notified);

log("8 daily run, nothing new", await runDailyCheck(BASE, mail));

// Pretend one recall is new: forget we sent it.
const w = store.all.get("me@x.com")!;
const forgotten = w.notified.pop()!;
log(`9 daily run after forgetting ${forgotten}`, await runDailyCheck(BASE, mail));
const alert = outbox.at(-1)!;
console.log("subject:", alert.subject, "\n", alert.text.slice(0, 500));
log("10 daily run again, no duplicate", await runDailyCheck(BASE, mail));

log("11 unsubscribe", await unsubscribeWatch(tokenFrom(alert.text, "/watch/unsubscribe")));
log("12 daily run after unsubscribe", await runDailyCheck(BASE, mail));
log("13 old confirm link after unsubscribe", await confirmWatch(confirmToken));
console.log("\ntotal emails sent:", outbox.length);
