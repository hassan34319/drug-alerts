// The FDA writes the same medicine many ways: "Hydromorphone HCl", "HYDROMORPHONE HYDROCHLORIDE",
// "Hydromorphone Hydrochloride Injection". We reduce each name to its active ingredients.

// Salt forms and dosage-form words that don't change which medicine it is.
const NOISE = new Set([
  "hydrochloride", "hcl", "sodium", "potassium", "calcium", "magnesium", "sulfate", "sulphate",
  "citrate", "acetate", "phosphate", "maleate", "tartrate", "bitartrate", "mesylate", "besylate",
  "fumarate", "succinate", "bromide", "chloride", "hyclate", "monohydrate", "dihydrate", "anhydrous",
  "trihydrate", "hydrobromide", "amorphous", "crystalline",
  "injection", "injectable", "tablet", "tablets", "capsule", "capsules", "oral", "solution",
  "suspension", "extended", "release", "er", "xr", "sr", "film", "coated", "usp", "for", "in",
  "dextrose", "water", "sterile", "powder", "cream", "ointment", "gel", "topical", "liquid", "syrup",
  // strength units: the FDA sometimes puts the strength in the name ("METFORMIN ER 500 MG")
  "mg", "mcg", "g", "gm", "gms", "ml", "l", "units", "unit", "meq", "mmol", "iu",
  "extended-release", "delayed-release", "hci", // "hci" is a common typo for hcl in FDA records
]);

// Packaging and descriptive words that appear in product names but are never a second drug.
const PACKAGING = new Set([
  "vial", "vials", "syringe", "syringes", "bag", "bags", "bottle", "bottles", "jar", "jars", "pack",
  "packet", "packets", "carton", "cassette", "fill", "single", "dose", "single-dose", "multi-dose", "use",
  "only", "rx", "pf", "preservative", "free", "preservative-free", "count", "per", "each", "total",
  "concentration", "inj", "infusion", "intravenous", "iv", "intrathecal", "ophthalmic", "nasal",
  "chewable", "caplets", "caplet", "tabs", "tab", "ns", "nacl", "saline", "normal", "of", "a", "the", "with",
  // OTC marketing words ("Children's Pain & Fever", "Extra Strength Pain Reliever/Fever Reducer")
  "pain", "fever", "relief", "reliever", "reducer", "strength", "extra", "maximum", "regular",
  "children", "childrens", "infants", "infant", "kids", "adult", "adults", "junior",
  "liqui", "gels", "softgel", "softgels", "solubilized",
]);

/** "Acetaminophen and Diphenhydramine HCl" -> ["acetaminophen", "diphenhydramine"] */
export function ingredients(name: string): string[] {
  return [
    ...new Set(
      name
        .toLowerCase()
        .split(/\s+and\s+|,|\/|;|\+/) // "+" too, so our own keys ("a + b") split back into ingredients
        .map((part) =>
          part
            .replace(/[^a-z\s-]/g, " ")
            .split(/\s+/)
            .filter((w) => w && !NOISE.has(w))
            .join(" ")
            .trim(),
        )
        .filter(Boolean),
    ),
  ].sort();
}

/** A stable key for a medicine, e.g. "acetaminophen + diphenhydramine". */
export const ingredientKey = (name: string) => ingredients(name).join(" + ");

/** Does a record's generic name describe exactly this medicine (same ingredients, no extras)? */
export function sameMedicine(recordGeneric: string, target: string[]): boolean {
  const rec = ingredients(recordGeneric);
  return rec.length === target.length && target.every((t) => rec.includes(t));
}

/**
 * Does a free-text product name describe exactly this medicine? Used for recalls the FDA never linked
 * to its product directory, e.g. "HYDROmorphone HCl 30 mg/30 mL in 0.9% Sodium Chloride Injection".
 * The name is split wherever a second drug could start ("and", "/word", "+", "&", "w/", "drug-drug"); every piece
 * that still has real words in it must name one of our ingredients, and every ingredient must appear.
 * "Hydromorphone 50mg/50mL" -> pieces "hydromorphone", "" (just units) -> match.
 * "Amlodipine and Atorvastatin Tablets" -> "amlodipine" names none of ours -> combination, no match.
 */
export function productNameMatches(productName: string, target: string[]): boolean {
  const pieces = productName
    .toLowerCase()
    // "/" only separates drugs when a word follows it ("hcl/epinephrine"), not inside a strength ("2mg/mL", "500 mg/5 mL")
    .split(/\s+and\s+|\s+w\/\s*|\/(?=\s*[a-z]{4,})|\+|&|(?<=[a-z]{4})-(?=[a-z]{4})/)
    .map((piece) =>
      piece
        .replace(/[^a-z\s-]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 1 && !NOISE.has(w) && !PACKAGING.has(w)),
    )
    .filter((words) => words.length > 0); // pieces that were only strengths/units/packaging

  if (pieces.length === 0) return false;
  const hasIngredient = (words: string[], t: string) => words.join(" ").includes(t);
  return (
    pieces.every((words) => target.some((t) => hasIngredient(words, t))) && // no unknown second drug
    target.every((t) => pieces.some((words) => hasIngredient(words, t))) // all of ours present
  );
}
