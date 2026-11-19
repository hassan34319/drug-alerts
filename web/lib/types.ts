// The shapes the Lambda's JSON API returns (copied from src/ on the backend side).
// Kept by hand on purpose: the website only depends on the API, never on backend code.

export type Medicine = { key: string; ingredients: string[]; productCount: number };

export type Product = {
  company: string;
  presentation: string;
  availability: string;
  ndc?: string;
  contact?: string;
  note?: string;
};

export type Recall = {
  id: string;
  class?: string;
  status?: string;
  reason?: string;
  firm?: string;
  reported?: string;
  product?: string;
};

export type GroupStatus = "all_unavailable" | "partly_unavailable" | "all_available";

export type DrugReport = {
  medicine: string;
  shortage: {
    inShortage: boolean;
    counts: Record<string, number>;
    groups: { strengthAndForm: string; status: GroupStatus; products: Product[]; availableAlternatives: Product[] }[];
    asOf: string | null;
  };
  recalls: { activeCount: number; pastCount: number; active: Recall[]; latest: Recall | null; asOf: string | null };
  disclaimer: string;
};

export type CheckResult =
  | { status: "found"; query: string; report: DrugReport }
  | { status: "choose"; query: string; options: Medicine[] }
  | { status: "not_found"; query: string; suggestions: string[] };

export type Alert = Recall & { medicine?: string };

export type Unresolved = { query: string; status: "choose" | "not_found"; options?: string[]; suggestions?: string[] };

export type RecentAlerts = { from: string; to: string; total: number; alerts: Alert[]; unresolved: Unresolved[]; note: string };

export type WatchResult =
  | { status: "confirmation_sent"; email: string; medicines: string[] }
  | { status: "already_confirmed"; email: string; medicines: string[]; added: string[] }
  | { status: "confirmation_recently_sent"; email: string }
  | { status: "unresolved"; unresolved: Unresolved[]; resolved: string[] }
  | { status: "invalid_email"; email: string }
  | { status: "email_failed"; email: string };

export type TokenResult = { ok: boolean; email?: string; medicines?: string[] };
