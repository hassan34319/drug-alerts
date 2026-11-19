// The watchlist flows. The MCP tool, the confirm/unsubscribe routes and the daily-check Lambda all call these.

import { buildAlerts, resolveMedicines, type RecentAlerts } from "./alerts";
import { identifyCached, recentWindowCached } from "./service";
import { getWatchStore, normEmail, type Watcher } from "./watchlist";
import { makeToken, readToken } from "./tokens";
import { alertEmail, confirmationEmail, getMailer, type Mailer } from "./email";

const now = () => Math.floor(Date.now() / 1000);
const RESEND_AFTER = 60 * 60; // don't send another confirmation email to the same address within an hour
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type WatchRequestResult =
  | { status: "confirmation_sent"; email: string; medicines: string[] }
  | { status: "already_confirmed"; email: string; medicines: string[]; added: string[] }
  | { status: "confirmation_recently_sent"; email: string }
  | { status: "unresolved"; unresolved: RecentAlerts["unresolved"]; resolved: string[] }
  | { status: "invalid_email"; email: string };

/**
 * Someone asks to watch medicines. Names are resolved first: anything unclear comes back for the user
 * to clarify, and nothing is saved until every name is exact. A new watcher gets a confirmation email
 * (double opt-in); a confirmed watcher just has the new medicines added.
 */
export async function requestWatch(rawEmail: string, names: string[], baseUrl: string, mail: Mailer = getMailer()): Promise<WatchRequestResult> {
  const email = normEmail(rawEmail);
  if (!EMAIL_RE.test(email)) return { status: "invalid_email", email };

  const { resolved, unresolved } = await resolveMedicines(names, identifyCached);
  const keys = [...new Set(resolved.map((m) => m.key))];
  if (unresolved.length) return { status: "unresolved", unresolved, resolved: keys };

  const store = getWatchStore();
  const existing = await store.get(email);

  if (existing?.status === "confirmed") {
    const added = keys.filter((k) => !existing.medicines.includes(k));
    if (added.length) {
      // Mark what's already on record for the new medicines as seen, so only future recalls are emailed.
      const seen = await currentRecallIds(added);
      await store.put({ ...existing, medicines: [...existing.medicines, ...added], notified: [...existing.notified, ...seen] });
    }
    return { status: "already_confirmed", email, medicines: [...existing.medicines, ...added], added };
  }

  const medicines = [...new Set([...(existing?.medicines ?? []), ...keys])];
  if (existing?.status === "pending" && existing.lastConfirmationSentAt && now() - existing.lastConfirmationSentAt < RESEND_AFTER) {
    await store.put({ ...existing, medicines });
    return { status: "confirmation_recently_sent", email };
  }

  await mail(confirmationEmail(email, medicines, `${baseUrl}/watch/confirm?token=${makeToken(email, "confirm")}`));
  await store.put({
    email,
    medicines,
    status: "pending",
    notified: existing?.notified ?? [],
    createdAt: existing?.createdAt ?? now(),
    lastConfirmationSentAt: now(),
  });
  return { status: "confirmation_sent", email, medicines };
}

/** The confirm link was clicked. Recalls already on record are marked as seen: alerts start from now. */
export async function confirmWatch(token: string): Promise<{ ok: boolean; email?: string; medicines?: string[] }> {
  const email = readToken(token, "confirm");
  if (!email) return { ok: false };
  const store = getWatchStore();
  const w = await store.get(email);
  if (!w || w.status === "unsubscribed") return { ok: false };
  if (w.status === "confirmed") return { ok: true, email, medicines: w.medicines };

  const seen = await currentRecallIds(w.medicines);
  await store.put({ ...w, status: "confirmed", confirmedAt: now(), notified: [...new Set([...w.notified, ...seen])] });
  return { ok: true, email, medicines: w.medicines };
}

/** The unsubscribe link was clicked. The record is kept (status "unsubscribed") so it can't be re-confirmed by an old link. */
export async function unsubscribeWatch(token: string): Promise<{ ok: boolean; email?: string }> {
  const email = readToken(token, "unsubscribe");
  if (!email) return { ok: false };
  const store = getWatchStore();
  const w = await store.get(email);
  if (w && w.status !== "unsubscribed") await store.put({ ...w, status: "unsubscribed" });
  return { ok: true, email };
}

const DAILY_WINDOW_DAYS = 7; // the FDA publishes weekly; "notified" stops the same recall being sent twice

/**
 * Run once a day. Fetches the recall window ONCE, then for each confirmed watcher keeps the recalls for
 * their medicines that they haven't been told about, emails them, and records what was sent.
 */
export async function runDailyCheck(apiBaseUrl: string, mail: Mailer = getMailer()) {
  const store = getWatchStore();
  const watchers = await store.listConfirmed();
  const window = await recentWindowCached(DAILY_WINDOW_DAYS);
  const summary = { watchers: watchers.length, emailed: 0, alerts: 0, failed: 0 };

  for (const w of watchers) {
    try {
      const fresh = await newAlertsFor(w, window);
      if (!fresh.length) continue;
      const unsubscribeUrl = `${apiBaseUrl}/watch/unsubscribe?token=${makeToken(w.email, "unsubscribe")}`;
      await mail(alertEmail(w.email, fresh, unsubscribeUrl));
      await store.put({ ...w, notified: [...w.notified, ...fresh.map((a) => a.id)] });
      summary.emailed++;
      summary.alerts += fresh.length;
    } catch (err) {
      // One person's failure (bad address, SES hiccup) must not stop everyone else's alerts.
      summary.failed++;
      console.error(`daily check failed for a watcher:`, err);
    }
  }
  return summary;
}

async function newAlertsFor(w: Watcher, window: Awaited<ReturnType<typeof recentWindowCached>>) {
  const { resolved } = await resolveMedicines(w.medicines, identifyCached);
  const report = buildAlerts(window, resolved);
  const seen = new Set(w.notified);
  return report.alerts.filter((a) => !seen.has(a.id));
}

/** Ids of recalls in the current window that match these medicines (used to mark them as already seen). */
async function currentRecallIds(medicines: string[]): Promise<string[]> {
  if (!medicines.length) return [];
  const { resolved } = await resolveMedicines(medicines, identifyCached);
  const window = await recentWindowCached(DAILY_WINDOW_DAYS);
  return buildAlerts(window, resolved).alerts.map((a) => a.id);
}
