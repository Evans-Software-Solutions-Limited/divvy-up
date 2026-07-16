/**
 * Lowest 0..7 people-palette colour slot not already used by the group's active
 * members (→ CSS `--p1..--p8`). A pure helper shared by the repositories that
 * mint members (groups, invites); kept in its own module so it stays importable
 * from tests that mock those repositories.
 *
 * Known benign race at every call site: the read-then-write of "which slots are
 * free" isn't serialised, so two concurrent member creations can pick the same
 * free slot and both commit (the schema range-checks 0..7 but doesn't enforce
 * uniqueness). Effect is cosmetic only — a duplicated palette colour, no
 * integrity loss — and this app has effectively no write concurrency.
 */
export function nextColourIndex(usedIndexes: number[]): number {
  const used = new Set(usedIndexes);
  for (let i = 0; i < 8; i++) {
    if (!used.has(i)) return i;
  }
  return usedIndexes.length % 8;
}
