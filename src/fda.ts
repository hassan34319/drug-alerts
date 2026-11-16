// Thin client for the three openFDA endpoints we use.
// openFDA returns HTTP 404 when a search has no matches, so we turn that into [].

const BASE = "https://api.fda.gov/drug";
const API_KEY = process.env.OPENFDA_API_KEY; // optional: raises rate limits

export type FdaResponse<T> = { lastUpdated: string | null; total: number; results: T[] };

async function query<T>(endpoint: string, params: Record<string, string>): Promise<FdaResponse<T>> {
  const qs = new URLSearchParams(params);
  if (API_KEY) qs.set("api_key", API_KEY);
  // URLSearchParams turns spaces into "+", which openFDA reads as a space (= OR between terms).
  const url = `${BASE}/${endpoint}.json?${qs.toString()}`;

  const res = await fetch(url);
  if (res.status === 404) return { lastUpdated: null, total: 0, results: [] };
  if (!res.ok) throw new Error(`openFDA ${endpoint} failed: ${res.status} ${await res.text()}`);

  const data = await res.json();
  return {
    lastUpdated: data.meta?.last_updated ?? null,
    total: data.meta?.results?.total ?? data.results?.length ?? 0,
    results: data.results ?? [],
  };
}

// Strip characters that would break openFDA's query syntax.
const clean = (s: string) => s.replace(/["+:()\\]/g, " ").trim();

// ---------- Product directory (NDC) ----------
export type NdcProduct = {
  brand_name?: string;
  generic_name?: string;
  labeler_name?: string;
  dosage_form?: string;
  product_ndc?: string;
  active_ingredients?: { name: string; strength: string }[];
};

/** Find marketed products whose brand OR generic name matches the input. */
export function searchProducts(name: string) {
  const n = clean(name);
  return query<NdcProduct>("ndc", {
    search: `brand_name:"${n}" generic_name:"${n}"`, // a space between terms means OR
    limit: "100",
  });
}

// ---------- Shortages ----------
export type ShortageRecord = {
  generic_name: string;
  company_name?: string;
  presentation?: string;
  dosage_form?: string;
  availability?: string; // Available | Limited Availability | Unavailable
  status?: string; // Current | To Be Discontinued | Resolved
  contact_info?: string;
  related_info?: string;
  shortage_reason?: string;
  package_ndc?: string;
  update_date?: string;
};

export function getShortages(genericName: string) {
  return query<ShortageRecord>("shortages", {
    search: `generic_name:"${clean(genericName)}"`,
    limit: "1000",
  });
}

// ---------- Recalls (enforcement reports) ----------
export type RecallRecord = {
  recall_number: string;
  classification?: string; // Class I (most serious) | Class II | Class III
  status?: string;
  reason_for_recall?: string;
  product_description?: string;
  recalling_firm?: string;
  report_date?: string; // YYYYMMDD
  recall_initiation_date?: string;
  distribution_pattern?: string;
  openfda?: { generic_name?: string[] }; // FDA-linked product info; generic_name is a list
};

/**
 * Recalls mentioning a medicine, newest first. status is Ongoing (active), Completed or Terminated.
 * Searches the FDA-linked generic name OR the product description (a space means OR), because many
 * recalls are never linked to the product directory and only name the drug in their description.
 * Results include combinations and unrelated mentions: the caller filters with recallMatches().
 */
export function getRecalls(genericName: string, limit = 5) {
  const n = clean(genericName);
  return query<RecallRecord>("enforcement", {
    search: `openfda.generic_name:"${n}" product_description:"${n}"`,
    sort: "report_date:desc",
    limit: String(limit), // openFDA allows up to 1000 per request
  });
}

/**
 * Every recall the FDA reported between two dates (YYYYMMDD, inclusive), newest first.
 * Not filtered by medicine: the caller filters in memory (see alerts.ts), because most fresh
 * recalls have no openfda.generic_name yet, so a name search here would miss them.
 */
export function getRecentRecalls(fromDate: string, toDate: string) {
  return query<RecallRecord>("enforcement", {
    search: `report_date:[${fromDate} TO ${toDate}]`,
    sort: "report_date:desc",
    limit: "1000", // a week is ~30-100 recalls; 1000 (openFDA's max) covers our 90-day cap
  });
}

// ---------- Dataset freshness ----------
// A search with no matches returns 404 with no date, so we ask the dataset itself
// when it was last updated (one tiny request, remembered for an hour).
const freshness = new Map<string, { value: string | null; at: number }>();

export async function lastUpdated(endpoint: "shortages" | "enforcement"): Promise<string | null> {
  const hit = freshness.get(endpoint);
  if (hit && Date.now() - hit.at < 60 * 60 * 1000) return hit.value;
  const { lastUpdated: value } = await query(endpoint, { limit: "1" });
  freshness.set(endpoint, { value, at: Date.now() });
  return value;
}
