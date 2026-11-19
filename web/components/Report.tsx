// The medicine report, laid out like the "Drug Facts" panel on US medicine packaging:
// a heavy border, thick rules between sections, bold headings. People already know how to read it.
import Link from "next/link";
import type { DrugReport, GroupStatus, Product } from "@/lib/types";
import { ClassBadge, formatDate, RecallList } from "./Recalls";

const GROUP: Record<GroupStatus, { label: string; tone: string }> = {
  all_unavailable: { label: "Not available", tone: "badge-red" },
  partly_unavailable: { label: "Some makers short", tone: "badge-amber" },
  all_available: { label: "Available", tone: "badge-green" },
};

const availabilityTone = (a: string) =>
  /unavailable/i.test(a) ? "badge-red" : /limited/i.test(a) ? "badge-amber" : /available/i.test(a) ? "badge-green" : "badge-grey";

// Most serious recall first: Class I, II, III, then unclassified.
const rank = (c?: string) => ({ "Class I": 0, "Class II": 1, "Class III": 2 })[c ?? ""] ?? 3;
const byClass = (a: { class?: string }, b: { class?: string }) => rank(a.class) - rank(b.class);

function ProductRow({ p }: { p: Product }) {
  return (
    <li>
      <span>
        {p.company}
        {p.ndc && <span className="muted"> (NDC {p.ndc})</span>}
      </span>
      <span className={`badge ${availabilityTone(p.availability)}`}>{p.availability}</span>
      {p.note && <span className="note">{p.note}</span>}
    </li>
  );
}

export function Report({ report, searched }: { report: DrugReport; searched: string }) {
  const { shortage, recalls } = report;
  const showSearched = searched.toLowerCase() !== report.medicine.toLowerCase();

  return (
    <>
      <article className="facts" aria-labelledby="facts-title">
        <h1 id="facts-title" className="facts-title">
          {report.medicine}
        </h1>
        <p className="facts-sub">
          {showSearched ? <>You searched for &ldquo;{searched}&rdquo;. </> : null}
          Shortages and recalls for every US product with this active ingredient.
        </p>

        <section className="facts-block" aria-labelledby="shortage-h">
          <div className="facts-row">
            <h2 id="shortage-h">Shortage</h2>
            <span className="facts-summary">
              {shortage.inShortage ? (
                <span className="badge badge-red">In shortage</span>
              ) : (
                <span className="badge badge-green">No current shortage</span>
              )}
            </span>
          </div>
          {shortage.asOf && <p className="facts-asof">FDA shortage list as of {formatDate(shortage.asOf)}</p>}

          {shortage.groups.length === 0 && <p>The FDA isn&apos;t reporting a shortage for this medicine.</p>}

          {shortage.groups.map((g) => (
            <div className="group" key={g.strengthAndForm}>
              <div className="group-head">
                <h3>{g.strengthAndForm}</h3>
                <span className={`badge ${GROUP[g.status].tone}`}>{GROUP[g.status].label}</span>
              </div>
              {g.status !== "all_available" && g.availableAlternatives.length > 0 && (
                <div className="alternatives">
                  <strong>Reported available at this strength:</strong>
                  <ul>
                    {g.availableAlternatives.map((p, i) => (
                      <li key={`${p.company}-${p.ndc ?? i}`}>
                        {p.company}
                        {p.ndc ? ` (NDC ${p.ndc})` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <details className="products">
                <summary>{g.products.length === 1 ? "1 product" : `All ${g.products.length} products`} at this strength</summary>
                <ul className="product-list">
                  {g.products.map((p, i) => (
                    <ProductRow key={`${p.company}-${p.ndc ?? i}`} p={p} />
                  ))}
                </ul>
              </details>
            </div>
          ))}
          {shortage.inShortage && (
            <p className="small muted">
              Availability is what manufacturers report to the FDA, not what a particular pharmacy has in stock.
            </p>
          )}
        </section>

        <section className="facts-block" aria-labelledby="recalls-h">
          <div className="facts-row">
            <h2 id="recalls-h">Recalls</h2>
            <span className="facts-summary">
              {recalls.activeCount} active, {recalls.pastCount} past
            </span>
          </div>
          {recalls.asOf && <p className="facts-asof">FDA recall data as of {formatDate(recalls.asOf)}</p>}
          {recalls.active.length > 0 ? (
            <RecallList alerts={[...recalls.active].sort(byClass)} />
          ) : (
            <p>
              No active recalls.
              {recalls.latest && (
                <>
                  {" "}
                  The most recent one was reported {formatDate(recalls.latest.reported)}{" "}
                  <ClassBadge value={recalls.latest.class} />
                </>
              )}
            </p>
          )}
          {recalls.activeCount > 0 && (
            <p className="small muted">
              A recall usually covers specific lots. Check the lot number on your pack and ask your pharmacist before
              changing anything.
            </p>
          )}
        </section>

        <p className="facts-foot">{report.disclaimer}</p>
      </article>

      <div className="cta">
        <p>Get an email when the FDA publishes a new recall for {report.medicine}.</p>
        <Link className="btn" href={`/watch?medicine=${encodeURIComponent(report.medicine)}`}>
          Set up email alerts
        </Link>
      </div>
    </>
  );
}
