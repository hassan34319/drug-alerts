"use client";
// Email + medicines form. Submits to the watchAction Server Function, then shows what happened.
// When a name is unclear ("Tylenol"), the options appear as buttons that swap the exact name into the list.

import { useActionState, useState } from "react";
import { watchAction, type WatchState } from "@/app/actions";

export function WatchForm({ initialMedicine = "" }: { initialMedicine?: string }) {
  const [state, action, pending] = useActionState<WatchState, FormData>(watchAction, {});
  const [email, setEmail] = useState("");
  const [medicines, setMedicines] = useState(initialMedicine);

  // Replace one name in the list with the exact option the person picked.
  function choose(query: string, option: string) {
    const names = medicines.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    setMedicines(names.map((n) => (n.toLowerCase() === query.toLowerCase() ? option : n)).join(", "));
  }

  const r = state.result;

  if (r?.status === "confirmation_sent") {
    return (
      <div className="notice notice-ok section" role="status">
        <h2>Check your inbox</h2>
        <p>
          We sent a confirmation email to <b>{r.email}</b>. Open it and press <b>Confirm alerts</b> to start getting
          emails for {r.medicines.join(", ")}.
        </p>
        <p className="small">The link works for 7 days. If it isn&apos;t in your inbox, check spam.</p>
      </div>
    );
  }

  return (
    <>
      {r?.status === "already_confirmed" && (
        <div className="notice notice-ok section" role="status">
          <h2>You&apos;re already getting alerts</h2>
          <p>
            {r.added.length > 0 ? <>Added {r.added.join(", ")}. </> : <>Nothing new to add. </>}
            Your watchlist: {r.medicines.join(", ")}.
          </p>
        </div>
      )}
      {r?.status === "confirmation_recently_sent" && (
        <div className="notice section" role="status">
          <h2>A confirmation email is already on its way</h2>
          <p>
            We sent one to <b>{r.email}</b> less than an hour ago and added these medicines to it. Use the link in that
            email.
          </p>
        </div>
      )}
      {r?.status === "invalid_email" && (
        <div className="notice notice-error section" role="alert">
          <p>&ldquo;{r.email}&rdquo; doesn&apos;t look like an email address. Check it and try again.</p>
        </div>
      )}
      {r?.status === "email_failed" && (
        <div className="notice notice-error section" role="alert">
          <p>
            We couldn&apos;t send an email to <b>{r.email}</b>. Nothing was saved. Check the address, or try a different
            one.
          </p>
        </div>
      )}
      {r?.status === "unresolved" && (
        <div className="notice notice-error section" role="alert">
          <h2>Some names need a closer look</h2>
          <p>Nothing was saved yet. Fix these, then send again.</p>
          {r.unresolved.map((u) => (
            <div key={u.query}>
              <p>
                <b>{u.query}</b>{" "}
                {u.status === "choose" ? "is sold as several medicines. Which one?" : "wasn't found. Did you mean:"}
              </p>
              <div className="choices">
                {(u.status === "choose" ? u.options : u.suggestions)?.map((o) => (
                  <button type="button" key={o} onClick={() => choose(u.query, o)}>
                    {o}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {state.error && (
        <div className="notice notice-error section" role="alert">
          <p>{state.error}</p>
        </div>
      )}

      <form action={action} className="form">
        <div className="field">
          <label htmlFor="email">Your email</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="medicines">Medicines to watch</label>
          <p className="hint" id="medicines-hint">
            Brand or generic names, separated by commas. Up to 20.
          </p>
          <textarea
            id="medicines"
            name="medicines"
            required
            aria-describedby="medicines-hint"
            placeholder="Lipitor, metformin"
            value={medicines}
            onChange={(e) => setMedicines(e.target.value)}
          />
        </div>
        <div>
          <button className="btn" type="submit" disabled={pending}>
            {pending ? "Sending" : "Send confirmation email"}
          </button>
        </div>
      </form>
    </>
  );
}
