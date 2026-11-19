import type { Metadata } from "next";
import { Suspense } from "react";
import { WatchForm } from "@/components/WatchForm";

export const metadata: Metadata = { title: "Email alerts" };

type Props = { searchParams: Promise<{ medicine?: string }> };

export default function WatchPage({ searchParams }: Props) {
  return (
    <>
      <h1 className="page-title">Email me about new recalls</h1>
      <p className="lede">
        We check the FDA every morning and email you only when a new recall matches one of your medicines. You&apos;ll
        confirm your address first, and every email has an unsubscribe link.
      </p>
      <Suspense fallback={<WatchForm />}>
        <Prefilled searchParams={searchParams} />
      </Suspense>
    </>
  );
}

// "Set up email alerts" on a report page links here with ?medicine=..., so that name is already filled in.
async function Prefilled({ searchParams }: Props) {
  const { medicine } = await searchParams;
  return <WatchForm initialMedicine={medicine?.slice(0, 100) ?? ""} />;
}
