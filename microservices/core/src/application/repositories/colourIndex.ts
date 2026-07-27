/**
 * Lowest 0..7 people-palette colour slot not already used by the group's members
 * (→ CSS `--p1..--p8`). A pure helper shared by the repositories that mint members
 * (groups, invites); kept in its own module so it stays importable from tests that
 * mock those repositories.
 *
 * Callers must pass the FULL roster, removed members included — not just active
 * ones. A removed member stays in the group payload so their frozen debts can be
 * named, and is rendered alongside current members, so reusing their slot paints
 * two people the same colour. Worse, the invite flow reactivates a removed member
 * without re-minting their slot, so an active-only mint can collide two *current*
 * members.
 *
 * Known limit at the wrap: once all 8 slots are spoken for, this falls through to
 * `usedIndexes.length % 8`, which can collide with an active member even while
 * departed members hold idle slots. Preferring a departed member's slot before
 * wrapping would keep "never two active members in one colour" absolute at any
 * roster size; deferred to groups-and-members (#5) since it needs 9+ people ever
 * in one group to bite.
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
