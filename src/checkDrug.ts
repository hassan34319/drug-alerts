import { getRecalls, getShortages, lastUpdated, type RecallRecord, type ShortageRecord } from "./fda";
import { sameMedicine } from "./normalize";
import { recallMatches } from "./alerts";
import type { Medicine } from "./identify";

export const DISCLAIMER =
  "Information from FDA public data (openFDA), which the FDA says may be unvalidated. Not medical advice.";

type Product = {
  company: string;
  presentation: string;
  availability: string;
  ndc?: string;
  contact?: string;
  note?: string; // FDA's own note, e.g. "Next Delivery: January 2027; Estimated Recovery: March 2027"
};

type Recall = { id: string; class?: string; status?: string; reason?: string; firm?: string; reported?: string; product?: string };

// all_unavailable = no product in this group is fully "Available" (each is Unavailable or Limited)
export type GroupStatus = "all_unavailable" | "partly_unavailable" | "all_available";

export type DrugReport = {
  medicine: string;
  shortage: {
    inShortage: boolean;
    counts: Record<string, number>;
    // products grouped by strength + form, so alternatives are like-for-like; worst groups first
    groups: { strengthAndForm: string; status: GroupStatus; products: Product[]; availableAlternatives: Product[] }[];
    asOf: string | null;
  };
  recalls: {
    activeCount: number; // status "Ongoing"
    pastCount: number; // Completed or Terminated
    active: Recall[];
    latest: Recall | null; // most recent recall of any status
    asOf: string | null;
  };
  disclaimer: string;
};

const RANK: Record<GroupStatus, number> = { all_unavailable: 0, partly_unavailable: 1, all_available: 2 };

// "Hydromorphone Hydrochloride, Injection, 2 mg/1 mL (NDC 0409-3365-10)" -> "Injection, 2 mg/1 mL"
function strengthAndForm(r: ShortageRecord): string {
  const parts = (r.presentation ?? "").replace(/\(NDC[^)]*\)/i, "").split(",").map((s) => s.trim());
  return parts.slice(1).join(", ") || r.dosage_form || "Unspecified";
}

const fmtDate = (d?: string | null) => (d && d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d ?? null);

const toRecall = (r: RecallRecord): Recall => ({
  id: r.recall_number,
  class: r.classification,
  status: r.status,
  reason: r.reason_for_recall,
  firm: r.recalling_firm,
  reported: fmtDate(r.report_date) ?? undefined,
  product: r.product_description?.slice(0, 120),
});

export async function checkDrug(medicine: Medicine): Promise<DrugReport> {
  const searchTerm = medicine.ingredients.join(" and ");
  // All four requests are independent, so they run at the same time.
  const [shortageRes, recallRes, shortageDate, recallDate] = await Promise.all([
    getShortages(searchTerm),
    getRecalls(searchTerm, 1000), // every recall mentioning the name (up to a few hundred), newest first
    lastUpdated("shortages"),
    lastUpdated("enforcement"),
  ]);

  // The name search also matches combinations ("acetaminophen" finds Tylenol PM recalls),
  // so keep only recalls whose product is exactly this medicine, then count them ourselves.
  const recalls = recallRes.results.filter((r) => recallMatches(r, medicine.ingredients));
  const active = recalls.filter((r) => r.status === "Ongoing");

  // Keep only records for exactly this medicine (plain acetaminophen shouldn't pull in Tylenol PM).
  const shortages = shortageRes.results.filter(
    (r) => r.status !== "Resolved" && sameMedicine(r.generic_name, medicine.ingredients),
  );

  const counts: Record<string, number> = {};
  const byGroup = new Map<string, Product[]>();
  for (const r of shortages) {
    const availability = r.availability ?? "Unknown";
    counts[availability] = (counts[availability] ?? 0) + 1;
    const key = strengthAndForm(r);
    const list = byGroup.get(key) ?? [];
    list.push({
      company: r.company_name ?? "Unknown",
      presentation: r.presentation ?? "",
      availability,
      ndc: r.package_ndc,
      contact: r.contact_info,
      note: r.related_info,
    });
    byGroup.set(key, list);
  }

  const groups = [...byGroup.entries()]
    .map(([strengthAndForm, products]) => {
      const availableAlternatives = products.filter((p) => p.availability === "Available");
      const status: GroupStatus =
        availableAlternatives.length === 0
          ? "all_unavailable"
          : availableAlternatives.length === products.length
            ? "all_available"
            : "partly_unavailable";
      return { strengthAndForm, status, products, availableAlternatives };
    })
    // Fully-out strengths first: that's the most urgent news.
    .sort((a, b) => RANK[a.status] - RANK[b.status]);

  return {
    medicine: medicine.key,
    shortage: { inShortage: shortages.length > 0, counts, groups, asOf: fmtDate(shortageDate) },
    recalls: {
      activeCount: active.length,
      pastCount: recalls.length - active.length,
      active: active.slice(0, 10).map(toRecall),
      latest: recalls[0] ? toRecall(recalls[0]) : null,
      asOf: fmtDate(recallDate),
    },
    disclaimer: DISCLAIMER,
  };
}
