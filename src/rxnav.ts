// RxNav (US National Library of Medicine): spelling suggestions when a name matches nothing.
const RXNAV = "https://rxnav.nlm.nih.gov/REST";

export async function spellingSuggestions(name: string): Promise<string[]> {
  const res = await fetch(`${RXNAV}/spellingsuggestions.json?name=${encodeURIComponent(name)}`);
  if (!res.ok) return []; // a failed suggestion lookup should never break the search
  const data = await res.json();
  return data?.suggestionGroup?.suggestionList?.suggestion ?? [];
}
