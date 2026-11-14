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
]);

/** "Acetaminophen and Diphenhydramine HCl" -> ["acetaminophen", "diphenhydramine"] */
export function ingredients(name: string): string[] {
  return [
    ...new Set(
      name
        .toLowerCase()
        .split(/\s+and\s+|,|\/|;/)
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
