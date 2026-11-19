// Signed tokens for the confirm and unsubscribe links in emails.
// A token says "this email, this action, valid until this time", plus a signature made with a secret key.
// Anyone can read a token, but nobody without the secret can create or edit one, so links can't be forged
// (e.g. changing the email inside a link to unsubscribe someone else).

import { createHmac, timingSafeEqual } from "node:crypto";

export type TokenAction = "confirm" | "unsubscribe";
type Payload = { e: string; a: TokenAction; x: number }; // email, action, expiry (Unix seconds)

function secret(): string {
  const s = process.env.WATCH_SECRET;
  if (!s || s.length < 32) throw new Error("WATCH_SECRET is missing or too short (needs 32+ characters)");
  return s;
}

const sign = (data: string) => createHmac("sha256", secret()).update(data).digest("base64url");

/** "confirm" links expire after 7 days; "unsubscribe" links work for a year (old emails must still unsubscribe). */
export function makeToken(email: string, action: TokenAction): string {
  const ttl = action === "confirm" ? 7 * 86_400 : 365 * 86_400;
  const payload: Payload = { e: email, a: action, x: Math.floor(Date.now() / 1000) + ttl };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data)}`;
}

/** Returns the email if the token is genuine, for this action, and not expired; otherwise null. */
export function readToken(token: string, action: TokenAction): string | null {
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;

  const expected = Buffer.from(sign(data));
  const given = Buffer.from(sig);
  // timingSafeEqual compares in constant time, so an attacker can't guess the signature byte by byte.
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const p = JSON.parse(Buffer.from(data, "base64url").toString()) as Payload;
    if (p.a !== action || p.x < Date.now() / 1000) return null;
    return p.e;
  } catch {
    return null;
  }
}
