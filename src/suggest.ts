// Autocomplete for the website's search box.
// RxNav publishes every US drug name it knows (about 28,000, brand and generic) as one list (~750 KB).
// We download it once per Lambda instance and keep it in memory: too big for a DynamoDB item (400 KB max),
// and filtering 28,000 short strings in memory takes about a millisecond.

const DISPLAY_NAMES = "https://rxnav.nlm.nih.gov/REST/displaynames.json";

let names: Promise<string[]> | undefined;

function loadNames(): Promise<string[]> {
  names ??= fetch(DISPLAY_NAMES)
    .then((r) => {
      if (!r.ok) throw new Error(`RxNav ${r.status}`);
      return r.json();
    })
    .then((d) => (d?.displayTermsList?.term ?? []) as string[])
    .catch((err) => {
      names = undefined; // don't remember a failure: the next request tries again
      throw err;
    });
  return names;
}

/**
 * Up to `limit` names for what the user has typed so far. Names that START with it come first
 * ("lip" -> lipitor), then names with a later WORD starting with it ("codeine" -> tylenol with codeine).
 * Shorter names first within each group, since they're usually the base product.
 */
export async function suggest(query: string, limit = 8): Promise<string[]> {
  const q = query.toLowerCase().trim();
  if (q.length < 2) return [];
  const all = await loadNames();
  const starts: string[] = [];
  const words: string[] = [];
  for (const n of all) {
    if (n.startsWith(q)) starts.push(n);
    else if (n.includes(` ${q}`)) words.push(n);
  }
  const byLength = (a: string, b: string) => a.length - b.length || a.localeCompare(b);
  return [...starts.sort(byLength), ...words.sort(byLength)].slice(0, limit);
}
