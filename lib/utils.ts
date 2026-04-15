import { medList } from "./medList.js";

export interface MedEntry {
  brand: string;
  generic: string;
  strength: string;
}

export interface MedMatchResult {
  matched: boolean;
  matchedEntry?: MedEntry;
}

/**
 * Check if the identified pill loosely matches any entry in the medication list.
 * Matching is case-insensitive and allows partial matches.
 */
export function checkMedList(
  brandName: string,
  genericName: string
): MedMatchResult {
  const normalize = (s: string) => s.toLowerCase().trim();
  const brandNorm = normalize(brandName);
  const genericNorm = normalize(genericName);

  for (const entry of medList as MedEntry[]) {
    const entryBrand = normalize(entry.brand);
    const entryGeneric = normalize(entry.generic);

    const brandMatch =
      brandNorm !== "unknown" &&
      (brandNorm.includes(entryBrand) || entryBrand.includes(brandNorm));

    const genericMatch =
      genericNorm !== "unknown" &&
      (genericNorm.includes(entryGeneric) || entryGeneric.includes(genericNorm));

    if (brandMatch || genericMatch) {
      return { matched: true, matchedEntry: entry };
    }
  }

  return { matched: false };
}
