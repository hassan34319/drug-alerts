// One recall per row: class badge on the left, product, reason and details on the right.
import type { Alert } from "@/lib/types";

const CLASS_HELP: Record<string, string> = {
  "Class I": "Most serious: could cause serious harm or death",
  "Class II": "Could cause temporary or reversible harm",
  "Class III": "Unlikely to cause harm",
};

export function ClassBadge({ value }: { value?: string }) {
  const tone = value === "Class I" ? "badge-red" : value === "Class II" ? "badge-amber" : "badge-grey";
  return (
    <span className={`badge ${tone}`} title={value ? CLASS_HELP[value] : undefined}>
      {value ?? "Not yet classified"}
    </span>
  );
}

export function RecallList({ alerts, showMedicine = false }: { alerts: Alert[]; showMedicine?: boolean }) {
  return (
    <ul className="recalls">
      {alerts.map((a, i) => (
        <li className="recall" key={`${a.id}-${i}`}>
          <ClassBadge value={a.class} />
          <div>
            <div className="recall-product">{tidy(a.product)}</div>
            {a.reason && <p className="recall-reason">{a.reason}</p>}
            <div className="recall-meta">
              {showMedicine && a.medicine && <span>Matches {a.medicine}</span>}
              {a.firm && <span>{a.firm}</span>}
              {a.reported && <span>reported {formatDate(a.reported)}</span>}
              {a.status && <span>{a.status === "Ongoing" ? "still active" : a.status.toLowerCase()}</span>}
              {a.id && !a.id.startsWith("unnumbered") && <span>recall {a.id}</span>}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

// FDA product text sometimes uses **asterisks** for emphasis and odd spacing.
export const tidy = (s?: string) => (s ?? "").replace(/\*+/g, "").replace(/\s+/g, " ").trim();

export function formatDate(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
