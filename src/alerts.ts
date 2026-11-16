// Recent recalls across all US medicines, optionally narrowed to a list of medicines.
// Used by the recent_alerts MCP tool now, and by the daily watchlist job in Phase 5.

import { getRecentRecalls, lastUpdated, type RecallRecord } from "./fda";
import { identify, type IdentifyResult, type Medicine } from "./identify";
import { ingredients, productNameMatches, sameMedicine } from "./normalize";

// ---------- dates ----------

/** "20261104" minus 7 days -> "20261028". Works in UTC so time zones can't shift the day. */
export function daysBefore(yyyymmdd: string, days: number): string {
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6));
  const d = Number(yyyymmdd.slice(6, 8));
  const date = new Date(Date.UTC(y, m - 1, d) - days * 86_400_000);
  return date.toISOString().slice(0, 10).replace(/-/g, ""); // "2026-10-28" -> "20261028"
}

const toDashed = (d: string) =>
  `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`; // "20261104" -> "2026-11-04"

// ---------- matching ----------

/**
 * Does this recall belong to exactly this medicine (no combinations)?
 * 1. If the FDA linked the recall to its product directory (openfda.generic_name), compare ingredients exactly.
 * 2. Otherwise (most fresh recalls, and many old ones) read the product name: the text before the first
 *    comma of product_description, e.g. "Atorvastatin Calcium Tablets, USP, 10 mg, 90-count bottle...",
 *    or the generic name in brackets after a brand name.
 */
export function recallMatches(
  r: Pick<RecallRecord, "openfda" | "product_description">,
  target: string[],
): boolean {
  const linked = r.openfda?.generic_name;
  if (linked && linked.length > 0)
    return linked.some((g) => sameMedicine(g, target));

  const description = r.product_description ?? "";
  const productName = description.split(/[,;]/)[0]; // ";" separates multiple products in one recall

  // Brand with the generic in brackets: "Riomet (metformin hydrochloride oral solution) 500 mg".
  // Judge by the bracket contents (commas there list ingredients, e.g. "(acetaminophen 500mg, phenylephrine 5mg)").
  const open = productName.indexOf("(");
  if (open >= 0) {
    const close = description.indexOf(")", open);
    const inner = description
      .slice(open + 1, close > open ? close : undefined)
      .split(";")[0]
      .toLowerCase();
    // If the brackets mention our medicine, they ARE the ingredient list: decide on them alone,
    // so "Wound Gel (Benzalkonium Chloride and Lidocaine)" counts as a combination.
    if (target.every((t) => inner.includes(t)))
      return productNameMatches(inner.replace(/,/g, " and "), target);
    // Otherwise the brackets are a note like "(Generic for Xylocaine)" or "(NSAID)": ignore them.
    return productNameMatches(productName.slice(0, open), target);
  }
  return productNameMatches(productName, target);
}

// ---------- the report ----------

export type Alert = {
  id: string;
  class?: string; // Class I (most serious) | Class II | Class III | Not Yet Classified
  status?: string; // Ongoing | Completed | Terminated
  reported?: string; // YYYY-MM-DD
  firm?: string;
  product?: string;
  reason?: string;
  medicine?: string; // which of the requested medicines it matched (only when medicines were given)
};

export type RecentAlerts = {
  from: string; // window start, YYYY-MM-DD
  to: string; // window end = the FDA's last update, YYYY-MM-DD
  total: number;
  alerts: Alert[];
  unresolved: {
    query: string;
    status: "choose" | "not_found";
    options?: string[];
    suggestions?: string[];
  }[];
  note: string;
};

const CLASS_RANK: Record<string, number> = {
  "Class I": 0,
  "Class II": 1,
  "Class III": 2,
};
const rank = (c?: string) => CLASS_RANK[c ?? ""] ?? 3; // "Not Yet Classified" and unknowns go last

const toAlert = (r: WindowRecall, medicine?: string): Alert => ({
  id: r.recall_number,
  class: r.classification,
  status: r.status,
  reported: r.report_date ? toDashed(r.report_date) : undefined,
  firm: r.recalling_firm,
  product: r.product_description?.slice(0, 160),
  reason: r.reason_for_recall?.slice(0, 240),
  ...(medicine ? { medicine } : {}),
});

// ---------- step 1: the window (same for everyone, so this is what gets cached) ----------

/** A recall trimmed to what matching and the report need, so a 90-day window stays well under 400 KB. */
export type WindowRecall = Pick<
  RecallRecord,
  | "recall_number"
  | "classification"
  | "status"
  | "report_date"
  | "recalling_firm"
  | "product_description"
  | "reason_for_recall"
> & { openfda?: { generic_name?: string[] } };

export type RecallWindow = {
  from: string;
  to: string;
  recalls: WindowRecall[];
}; // dates as YYYYMMDD

/**
 * Every recall the FDA reported in the last `days` days, counted back from the FDA's latest weekly update
 * (not from today, or a window that starts after the last update comes back empty). Not filtered by medicine.
 */
export async function fetchRecallWindow(days = 7): Promise<RecallWindow> {
  const updated = await lastUpdated("enforcement"); // e.g. "2026-11-04"
  if (!updated)
    throw new Error("Could not read the FDA recall dataset's last update date");
  const to = updated.replace(/-/g, "");
  const from = daysBefore(to, days - 1); // inclusive window: days=7 covers the update day plus the 6 before

  const { results } = await getRecentRecalls(from, to);
  const recalls = results.map((r) => ({
    recall_number: r.recall_number,
    classification: r.classification,
    status: r.status,
    report_date: r.report_date,
    recalling_firm: r.recalling_firm,
    product_description: r.product_description?.slice(0, 500), // the product name and bracket text are near the start
    reason_for_recall: r.reason_for_recall?.slice(0, 300),
    ...(r.openfda?.generic_name
      ? { openfda: { generic_name: r.openfda.generic_name } }
      : {}),
  }));
  return { from, to, recalls };
}

// ---------- step 2: medicine names -> exact medicines ----------

/**
 * Resolve each name with `identifyFn` (the service passes the cached version).
 * A name containing "+" is an option key from an earlier "choose" result (e.g. "acetaminophen + diphenhydramine"):
 * it already names exact ingredients, so it's used directly instead of being searched again.
 */
export async function resolveMedicines(
  names: string[],
  identifyFn: (name: string) => Promise<IdentifyResult> = identify,
): Promise<{ resolved: Medicine[]; unresolved: RecentAlerts["unresolved"] }> {
  const results = await Promise.all(
    names.map((m): Promise<IdentifyResult> => {
      if (!m.includes("+")) return identifyFn(m);
      const list = ingredients(m);
      return Promise.resolve({
        status: "found",
        query: m,
        medicine: { key: list.join(" + "), ingredients: list, productCount: 0 },
      });
    }),
  );
  const resolved: Medicine[] = [];
  const unresolved: RecentAlerts["unresolved"] = [];
  for (const id of results) {
    if (id.status === "found") resolved.push(id.medicine);
    else if (id.status === "choose")
      unresolved.push({
        query: id.query,
        status: "choose",
        options: id.options.map((o) => o.key),
      });
    else
      unresolved.push({
        query: id.query,
        status: "not_found",
        suggestions: id.suggestions,
      });
  }
  return { resolved, unresolved };
}

// ---------- step 3: filter + sort (pure, instant, no network) ----------

/** Build the report from a window. With `medicines` (already resolved), keep only their recalls. */
export function buildAlerts(
  window: RecallWindow,
  medicines?: Medicine[],
  unresolved: RecentAlerts["unresolved"] = [],
): RecentAlerts {
  let alerts: Alert[];
  if (!medicines) {
    alerts = window.recalls.map((r) => toAlert(r));
  } else {
    alerts = [];
    for (const r of window.recalls) {
      const hit = medicines.find((m) => recallMatches(r, m.ingredients));
      if (hit) alerts.push(toAlert(r, hit.key));
    }
  }

  // Most serious first; newest first within the same class.
  alerts.sort(
    (a, b) =>
      rank(a.class) - rank(b.class) ||
      (b.reported ?? "").localeCompare(a.reported ?? ""),
  );

  return {
    from: toDashed(window.from),
    to: toDashed(window.to),
    total: alerts.length,
    alerts,
    unresolved,
    note:
      "FDA recall data is published weekly, so the window ends at the FDA's last update, not today. " +
      "Information from FDA public data (openFDA), which the FDA says may be unvalidated. Not medical advice.",
  };
}

// ---------- all three together ----------

type Deps = {
  getWindow?: (days: number) => Promise<RecallWindow>;
  identifyFn?: (name: string) => Promise<IdentifyResult>;
};

/**
 * Recent recalls, optionally narrowed to `medicines`; unclear names come back in `unresolved`.
 * `deps` lets the service plug in cached versions of the two network steps.
 */
export async function recentAlerts(
  days = 7,
  medicines?: string[],
  deps: Deps = {},
): Promise<RecentAlerts> {
  const getWindow = deps.getWindow ?? fetchRecallWindow;

  if (!medicines?.length) return buildAlerts(await getWindow(days));

  // Resolve names and fetch the window at the same time; neither needs the other.
  const [{ resolved, unresolved }, window] = await Promise.all([
    resolveMedicines(medicines, deps.identifyFn),
    getWindow(days),
  ]);
  return buildAlerts(window, resolved, unresolved);
}
