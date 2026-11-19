"use client";
// The confirm and unsubscribe pages. Opening the link only shows this button; pressing it does the action.
// (Email security scanners open every link in an email, but they don't press buttons.)

import Link from "next/link";
import { useActionState } from "react";
import { confirmAction, unsubscribeAction, type TokenState } from "@/app/actions";

const COPY = {
  confirm: {
    title: "Confirm your recall alerts",
    text: "Press the button to start getting emails when the FDA publishes a new recall for your medicines.",
    button: "Confirm alerts",
    busy: "Confirming",
  },
  unsubscribe: {
    title: "Unsubscribe from recall alerts",
    text: "Press the button to stop all recall alert emails to this address.",
    button: "Unsubscribe",
    busy: "Unsubscribing",
  },
};

export function TokenAction({ kind, token }: { kind: "confirm" | "unsubscribe"; token: string }) {
  const run = kind === "confirm" ? confirmAction : unsubscribeAction;
  const [state, action, pending] = useActionState<TokenState, FormData>(run, {});
  const copy = COPY[kind];
  const r = state.result;

  if (r?.ok) {
    return kind === "confirm" ? (
      <div className="notice notice-ok" role="status">
        <h2>You&apos;re subscribed</h2>
        <p>
          We&apos;ll email <b>{r.email}</b> when the FDA publishes a new recall for{" "}
          <b>{(r.medicines ?? []).join(", ")}</b>.
        </p>
        <p className="small">Recalls published before today aren&apos;t sent. Every email has an unsubscribe link.</p>
      </div>
    ) : (
      <div className="notice notice-ok" role="status">
        <h2>You&apos;re unsubscribed</h2>
        <p>
          <b>{r.email}</b> won&apos;t get any more recall alerts. You can <Link href="/watch">sign up again</Link> at
          any time.
        </p>
      </div>
    );
  }

  if (r && !r.ok) {
    return (
      <div className="notice notice-error" role="alert">
        <h2>This link isn&apos;t valid</h2>
        <p>
          It may have expired (confirmation links last 7 days) or been replaced. <Link href="/watch">Set up alerts
          again</Link> to get a new one.
        </p>
      </div>
    );
  }

  return (
    <>
      <h1 className="page-title">{copy.title}</h1>
      <p className="lede">{copy.text}</p>
      {state.error && (
        <div className="notice notice-error section" role="alert">
          <p>{state.error}</p>
        </div>
      )}
      <form action={action} className="section">
        <input type="hidden" name="token" value={token} />
        <button className={kind === "confirm" ? "btn" : "btn btn-plain"} type="submit" disabled={pending || !token}>
          {pending ? copy.busy : copy.button}
        </button>
        {!token && <p className="small muted">This link is missing its code. Open it again from the email.</p>}
      </form>
    </>
  );
}
