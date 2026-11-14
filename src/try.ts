// Quick manual test: npx tsx src/try.ts hydromorphone Dilaudid atorvastatin Tylenol hydromorfone
import { identify } from "./identify";
import { checkDrug } from "./checkDrug";

async function run(query: string) {
  console.log(`\n=== ${query} ===`);
  const id = await identify(query);

  if (id.status === "not_found") {
    console.log(`No drug found. Did you mean: ${id.suggestions.join(", ") || "(no suggestions)"}`);
    return;
  }
  if (id.status === "choose") {
    console.log("Did you mean:", id.options.map((o) => `${o.key} (${o.productCount} products)`).join(" | "));
    return;
  }

  const r = await checkDrug(id.medicine);
  console.log(`Medicine: ${r.medicine}`);
  console.log(`Shortage: ${r.shortage.inShortage ? "YES" : "no"}`, r.shortage.counts, `(FDA as of ${r.shortage.asOf})`);
  const LABEL = { all_unavailable: "NONE FULLY AVAILABLE", partly_unavailable: "PARTLY OUT", all_available: "ok" };
  for (const g of r.shortage.groups) {
    if (g.status === "all_available") continue; // keep the test output short: only show trouble
    console.log(`  [${LABEL[g.status]}] ${g.strengthAndForm}`);
    for (const p of g.products) {
      if (p.availability === "Available") continue;
      console.log(`    ${p.availability}: ${p.company} (NDC ${p.ndc})${p.note ? ` | FDA: ${p.note.slice(0, 90)}` : ""}`);
    }
    for (const a of g.availableAlternatives) console.log(`    -> available instead: ${a.company} (NDC ${a.ndc}) tel ${a.contact}`);
  }
  const { activeCount, pastCount, active, latest, asOf } = r.recalls;
  console.log(`Recalls: ${activeCount} active, ${pastCount} past (FDA as of ${asOf})`);
  for (const x of active.slice(0, 3)) console.log(`  ACTIVE ${x.reported} ${x.class} ${x.id}: ${x.reason?.slice(0, 80)}`);
  if (!active.length && latest) console.log(`  Latest (closed): ${latest.reported} ${latest.class}: ${latest.reason?.slice(0, 80)}`);
}

(async () => {
  for (const q of process.argv.slice(2)) await run(q);
})();
