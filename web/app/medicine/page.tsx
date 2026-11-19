import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Report } from "@/components/Report";
import { SearchBox } from "@/components/SearchBox";
import { checkMedicine } from "@/lib/fda";

type Props = { searchParams: Promise<{ q?: string; ingredients?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  return { title: q ? `${q}: shortages and recalls` : "Check a medicine" };
}

export default function MedicinePage({ searchParams }: Props) {
  return (
    <Suspense fallback={<Loading />}>
      <Result searchParams={searchParams} />
    </Suspense>
  );
}

async function Result({ searchParams }: Props) {
  const { q = "", ingredients } = await searchParams;
  const query = q.trim();

  if (query.length < 2) {
    return (
      <>
        <h1 className="page-title">Check a medicine</h1>
        <p className="lede">Type a brand or generic name.</p>
        <div className="section">
          <SearchBox />
        </div>
      </>
    );
  }

  let result;
  try {
    result = await checkMedicine(query, ingredients);
  } catch {
    return (
      <div className="notice notice-error" role="alert">
        <h2>The FDA data service didn&apos;t respond</h2>
        <p>Nothing is wrong with your search. Try again in a minute.</p>
      </div>
    );
  }

  if (result.status === "found") return <Report report={result.report} searched={query} />;

  if (result.status === "choose") {
    // e.g. "Tylenol" covers plain acetaminophen and several combination products.
    return (
      <>
        <h1 className="page-title">Which {query} do you mean?</h1>
        <p className="lede">
          &ldquo;{query}&rdquo; is sold as several different medicines. Pick the one on your pack&apos;s active
          ingredients list.
        </p>
        <div className="choices section">
          {result.options.map((o) => (
            <Link
              key={o.key}
              href={`/medicine?q=${encodeURIComponent(query)}&ingredients=${encodeURIComponent(o.ingredients.join(","))}`}
            >
              {o.key}
            </Link>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="page-title">No US medicine called &ldquo;{query}&rdquo;</h1>
      {result.suggestions.length > 0 ? (
        <>
          <p className="lede">Did you mean one of these? Check the spelling on your pack: similar names can be different drugs.</p>
          <div className="choices section">
            {result.suggestions.map((s) => (
              <Link key={s} href={`/medicine?q=${encodeURIComponent(s)}`}>
                {s}
              </Link>
            ))}
          </div>
        </>
      ) : (
        <p className="lede">Check the spelling on your pack, or try the generic name.</p>
      )}
      <div className="section">
        <SearchBox initial={query} />
      </div>
    </>
  );
}

function Loading() {
  return (
    <div className="facts" aria-busy="true">
      <p className="muted">Checking FDA shortage and recall data</p>
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}
