// Test the cache against the real DynamoDB table:
//   CACHE_TABLE=fda-drug-alert-cache AWS_PROFILE=fda AWS_REGION=ap-southeast-2 npx tsx src/try-cache.ts
// Run it twice: the first run fills the cache (slow), the second reads from it (fast).
import { identifyCached, checkDrugCached } from "./service";

async function timed<T>(label: string, f: () => Promise<T>): Promise<T> {
  const start = Date.now();
  const result = await f();
  console.log(`${label}: ${Date.now() - start} ms`);
  return result;
}

(async () => {
  if (!process.env.CACHE_TABLE) console.error("CACHE_TABLE not set: caching is off, every call goes to the FDA");
  const id = await timed("identify Dilaudid", () => identifyCached("Dilaudid"));
  if (id.status !== "found") return console.log(id);
  const report = await timed("checkDrug hydromorphone", () => checkDrugCached(id.medicine));
  console.log(`-> ${report.medicine}: shortage ${report.shortage.inShortage ? "YES" : "no"}, ${report.recalls.activeCount} active recalls`);
})();
