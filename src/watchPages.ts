// The small web pages people see when they click the links in our emails.
//
// Why a button instead of acting on the click itself: Gmail, Outlook and company security tools often
// "pre-open" every link in an email to scan it. If opening the link confirmed or unsubscribed, those scanners
// would do it without the person ever clicking. So opening the link (GET) only shows a page with a button,
// and the button (POST) does the action. Scanners open links; they don't press buttons.

import { DISCLAIMER } from "./checkDrug";

const esc = (s = "") =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>
  body{font-family:system-ui,Arial,sans-serif;background:#f6f7f9;color:#222;margin:0;padding:48px 16px}
  main{max-width:480px;margin:auto;background:#fff;border-radius:12px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
  h1{font-size:22px;margin:0 0 12px} p{line-height:1.5}
  button{font-size:16px;padding:10px 18px;border:0;border-radius:8px;background:#1a5fb4;color:#fff;cursor:pointer}
  .muted{font-size:12px;color:#777;margin-top:24px}
</style></head>
<body><main><h1>${esc(title)}</h1>${body}<p class="muted">${esc(DISCLAIMER)}</p></main></body></html>`;
}

/** GET page: explains the action and shows the button. The token rides along in a hidden form field. */
export function askPage(action: "confirm" | "unsubscribe", token: string): string {
  const copy =
    action === "confirm"
      ? { title: "Confirm your FDA drug alerts", text: "Click below to start getting emails about new FDA recalls for your medicines.", button: "Confirm alerts" }
      : { title: "Unsubscribe from FDA drug alerts", text: "Click below to stop all recall alert emails to this address.", button: "Unsubscribe" };
  return page(
    copy.title,
    `<p>${copy.text}</p>
     <form method="post"><input type="hidden" name="token" value="${esc(token)}"><button type="submit">${copy.button}</button></form>`,
  );
}

export const confirmedPage = (email: string, medicines: string[]) =>
  page(
    "You're subscribed",
    `<p>We'll email <b>${esc(email)}</b> when the FDA publishes a new recall for: <b>${esc(medicines.join(", "))}</b>.</p>
     <p>Recalls already published aren't sent. Every email has an unsubscribe link.</p>`,
  );

export const unsubscribedPage = (email: string) =>
  page("You're unsubscribed", `<p><b>${esc(email)}</b> won't get any more FDA recall alerts.</p>`);

export const invalidLinkPage = () =>
  page(
    "This link isn't valid",
    `<p>It may have expired (confirm links last 7 days) or already been used after unsubscribing.
     Ask Claude to add your medicines to the watchlist again to get a new link.</p>`,
  );
