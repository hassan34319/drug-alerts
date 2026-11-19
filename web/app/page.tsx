import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { SearchBox } from "@/components/SearchBox";
import { RecallList, formatDate } from "@/components/Recalls";
import { recentRecalls } from "@/lib/fda";

const EXAMPLES = ["Adderall", "Dilaudid", "amoxicillin", "Lipitor"];

export default function Home() {
  return (
    <>
      <section className="hero">
        <h1>Is your medicine in shortage or recalled?</h1>
        <p>
          Search any US medicine to see FDA-reported shortages by strength, which products are still available, and
          every recall.
        </p>
        <SearchBox />
        <p className="examples">
          Try{" "}
          {EXAMPLES.map((e) => (
            <Link key={e} href={`/medicine?q=${encodeURIComponent(e)}`}>
              {e}
            </Link>
          ))}
        </p>
      </section>

      <section className="section" aria-labelledby="week-h">
        <Suspense fallback={<WeekSkeleton />}>
          <ThisWeek />
        </Suspense>
      </section>
    </>
  );
}

// The FDA's latest weekly batch, most serious first. Cached for an hour (see lib/fda.ts).
async function ThisWeek() {
  // Render at request time (not baked in at build), so a failed FDA call never gets stuck in the page.
  await connection();
  let data;
  try {
    data = await recentRecalls(7);
  } catch {
    return <p className="muted">The FDA&apos;s recall feed isn&apos;t responding right now.</p>;
  }
  const classI = data.alerts.filter((a) => a.class === "Class I").length;
  return (
    <>
      <div className="section-head">
        <h2 id="week-h">Latest FDA recalls</h2>
        <Link href="/recalls">See all {data.total}</Link>
      </div>
      <p className="muted small">
        {data.total} drug recalls reported {formatDate(data.from)} to {formatDate(data.to)}
        {classI > 0 ? `, including ${classI} Class I (most serious)` : ""}. The FDA publishes recalls weekly.
      </p>
      <RecallList alerts={data.alerts.slice(0, 5)} />
    </>
  );
}

function WeekSkeleton() {
  return (
    <>
      <div className="section-head">
        <h2 id="week-h">Latest FDA recalls</h2>
      </div>
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </>
  );
}
