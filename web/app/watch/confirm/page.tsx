import type { Metadata } from "next";
import { Suspense } from "react";
import { TokenAction } from "@/components/TokenAction";

export const metadata: Metadata = { title: "Confirm alerts", robots: { index: false } };

type Props = { searchParams: Promise<{ token?: string }> };

// The link in the email lands here with ?token=... (directly, or redirected from the old Lambda link).
export default function Page({ searchParams }: Props) {
  return (
    <Suspense fallback={<p className="muted">Loading</p>}>
      <WithToken searchParams={searchParams} />
    </Suspense>
  );
}

async function WithToken({ searchParams }: Props) {
  const { token = "" } = await searchParams;
  return <TokenAction kind="confirm" token={token.slice(0, 2000)} />;
}
