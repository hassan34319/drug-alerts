import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RecallList, formatDate } from "@/components/Recalls";
import { recentRecalls } from "@/lib/fda";

export const metadata: Metadata = { title: "Recent recalls" };

const RANGES = [7, 30, 90];

type Props = { searchParams: Promise<{ days?: string }> };

export default function RecallsPage({ searchParams }: Props) {
  return (
    <>
      <h1 className="page-title">Recent US drug recalls</h1>
      <p className="lede">Every drug recall the FDA has reported, most serious first.</p>
      <Suspense fallback={<div className="section"><div className="skeleton" /><div className="skeleton" /></div>}>
        <Feed searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Feed({ searchParams }: Props) {
  const { days: raw } = await searchParams;
  const days = RANGES.includes(Number(raw)) ? Number(raw) : 7;

  let data;
  try {
    data = await recentRecalls(days);
  } catch {
    return (
      <div className="notice notice-error section" role="alert">
        <h2>The FDA recall feed didn&apos;t respond</h2>
        <p>Try again in a minute.</p>
      </div>
    );
  }

  return (
    <section className="section" aria-labelledby="feed-h">
      <div className="section-head">
        <h2 id="feed-h">
          {data.total} recalls, {formatDate(data.from)} to {formatDate(data.to)}
        </h2>
        <nav className="tabs" aria-label="Time range">
          {RANGES.map((d) => (
            <Link key={d} href={`/recalls?days=${d}`} aria-current={d === days ? "page" : undefined}>
              {d} days
            </Link>
          ))}
        </nav>
      </div>
      <p className="muted small">
        The FDA publishes recalls weekly, so this runs to its latest update, not today. Class I is the most serious.
      </p>
      {data.total === 0 ? <p>No recalls in this period.</p> : <RecallList alerts={data.alerts} />}
    </section>
  );
}
