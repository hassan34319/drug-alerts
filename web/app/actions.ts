"use server";
// Server Functions: the forms on the site call these. They run on the Next.js server,
// which then calls the Lambda, so the browser only ever talks to this site.

import * as fda from "@/lib/fda";
import type { TokenResult, WatchResult } from "@/lib/types";

export type WatchState = { result?: WatchResult; error?: string; email?: string; medicines?: string };

export async function watchAction(_prev: WatchState, form: FormData): Promise<WatchState> {
  const email = String(form.get("email") ?? "").trim();
  const medicines = String(form.get("medicines") ?? "");
  const names = medicines.split(/[,\n]/).map((s) => s.trim()).filter((s) => s.length >= 2);
  if (!email || names.length === 0) {
    return { email, medicines, error: "Enter your email and at least one medicine." };
  }
  if (names.length > 20) return { email, medicines, error: "Add up to 20 medicines at a time." };
  try {
    return { email, medicines, result: await fda.watch(email, names) };
  } catch {
    return { email, medicines, error: "The alert service didn't respond. Try again in a minute." };
  }
}

export type TokenState = { result?: TokenResult; error?: string };

async function tokenAction(run: (t: string) => Promise<TokenResult>, form: FormData): Promise<TokenState> {
  try {
    return { result: await run(String(form.get("token") ?? "")) };
  } catch {
    return { error: "The alert service didn't respond. Try again in a minute." };
  }
}

export async function confirmAction(_prev: TokenState, form: FormData) {
  return tokenAction(fda.confirm, form);
}

export async function unsubscribeAction(_prev: TokenState, form: FormData) {
  return tokenAction(fda.unsubscribe, form);
}
