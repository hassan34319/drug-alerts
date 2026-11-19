// The cached versions of our three lookups. The MCP tools (stdio and Lambda) call these,
// not identify/checkDrug/recentAlerts directly. The core files stay cache-free and easy to test.

import { cached, DAY, HOUR } from "./cache";
import { identify, type IdentifyResult, type Medicine } from "./identify";
import { checkDrug, type DrugReport } from "./checkDrug";
import { fetchRecallWindow, recentAlerts, type RecallWindow, type RecentAlerts } from "./alerts";

/** Same input -> same key: "Dilaudid ", "dilaudid" and "DILAUDID" share one cache entry. */
const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");

/**
 * Brand/generic name -> medicine. Found names are cached for 30 days (mappings rarely change);
 * "choose" and "not_found" only for a day, in case the FDA adds the product soon.
 */
export function identifyCached(query: string): Promise<IdentifyResult> {
  return cached(`identify#${norm(query)}`, (r: IdentifyResult) => (r.status === "found" ? 30 * DAY : DAY), () =>
    identify(query),
  );
}

/** Shortage + recall report. 3 hours: the FDA updates shortages about daily and recalls weekly. */
export function checkDrugCached(medicine: Medicine): Promise<DrugReport> {
  return cached(`report#${medicine.key}`, 3 * HOUR, () => checkDrug(medicine));
}

/**
 * Recent recalls. The FDA window is cached once per `days` value and shared by every request:
 * "all recalls", ["Lipitor"] and ["metformin"] all reuse the same cached window and are filtered
 * in memory (instant). Medicine names go through identifyCached, so they're cached too.
 * The daily watchlist job (Phase 5) gets the same benefit: one FDA fetch for all users.
 */
export function recentAlertsCached(days = 7, medicines?: string[]): Promise<RecentAlerts> {
  return recentAlerts(days, medicines, { getWindow: recentWindowCached, identifyFn: identifyCached });
}

/** The raw recall window for `days`, cached 3 hours. Shared by recent_alerts and the watchlist. */
export function recentWindowCached(days: number): Promise<RecallWindow> {
  return cached(`window#${days}`, 3 * HOUR, () => fetchRecallWindow(days));
}
