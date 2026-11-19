// Server-side calls to the Lambda's JSON API. "server-only" makes the build fail if a browser
// component ever imports this file, so the API address and calls never reach the browser.
import "server-only";
import { cacheLife } from "next/cache";
import type { CheckResult, RecentAlerts, TokenResult, WatchResult } from "./types";

function base(): string {
  const url = process.env.FDA_API_URL;
  if (!url) throw new Error("FDA_API_URL is not set");
  return url.replace(/\/$/, "");
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base()}${path}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`FDA API ${res.status} on ${path}`);
  return res.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok && res.status !== 400) throw new Error(`FDA API ${res.status} on ${path}`);
  return res.json() as Promise<T>;
}

// Reads are cached for an hour on the Next.js side too ('use cache'): the FDA updates shortages
// about daily and recalls weekly, and the Lambda has its own 3-hour cache behind this.

export async function checkMedicine(q: string, ingredients?: string): Promise<CheckResult> {
  "use cache";
  cacheLife("hours");
  const params = new URLSearchParams({ q });
  if (ingredients) params.set("ingredients", ingredients);
  return getJson(`/api/check?${params}`);
}

export async function recentRecalls(days: number): Promise<RecentAlerts> {
  "use cache";
  cacheLife("hours");
  return getJson(`/api/recent?days=${days}`);
}

export async function suggestNames(q: string): Promise<string[]> {
  "use cache";
  cacheLife("days");
  const data = await getJson<{ suggestions: string[] }>(`/api/suggest?q=${encodeURIComponent(q)}`);
  return data.suggestions;
}

// Writes are never cached.
export const watch = (email: string, medicines: string[]) => postJson<WatchResult>("/api/watch", { email, medicines });
export const confirm = (token: string) => postJson<TokenResult>("/api/watch/confirm", { token });
export const unsubscribe = (token: string) => postJson<TokenResult>("/api/watch/unsubscribe", { token });
