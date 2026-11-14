import { searchProducts } from "./fda";
import { ingredients, ingredientKey } from "./normalize";
import { spellingSuggestions } from "./rxnav";

export type Medicine = { key: string; ingredients: string[]; productCount: number };

export type IdentifyResult =
  | { status: "found"; query: string; medicine: Medicine }
  | { status: "choose"; query: string; options: Medicine[] } // e.g. Tylenol vs Tylenol PM
  | { status: "not_found"; query: string; suggestions: string[] };

/** Turn whatever the user typed (brand or generic) into the medicine(s) it refers to. */
export async function identify(query: string): Promise<IdentifyResult> {
  const { results } = await searchProducts(query);

  if (results.length === 0) {
    return { status: "not_found", query, suggestions: await spellingSuggestions(query) };
  }

  // Group the matching products by their active ingredients.
  const groups = new Map<string, Medicine>();
  for (const p of results) {
    if (!p.generic_name) continue;
    const key = ingredientKey(p.generic_name);
    if (!key) continue;
    const g = groups.get(key) ?? { key, ingredients: ingredients(p.generic_name), productCount: 0 };
    g.productCount++;
    groups.set(key, g);
  }

  const options = [...groups.values()].sort((a, b) => b.productCount - a.productCount);
  if (options.length === 0) return { status: "not_found", query, suggestions: [] };
  if (options.length === 1) return { status: "found", query, medicine: options[0] };

  // Someone typed a generic name exactly (e.g. a doctor typing "atorvastatin"): no need to ask.
  const exact = options.find((o) => o.key === ingredientKey(query));
  if (exact) return { status: "found", query, medicine: exact };

  // Otherwise ask, showing the most common matches first.
  return { status: "choose", query, options: options.slice(0, 5) };
}
