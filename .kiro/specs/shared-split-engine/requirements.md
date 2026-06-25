# Requirements — Shared Split Engine (`packages/split-engine`)

## Introduction

Divvy Up's core promise is **"no hidden split math" — every share is explainable, visible, and
exactly correct**. Today the split math lives in two incompatible places: the interactive
prototype (`~/Downloads/Divvy Up/app/compute.jsx`, `splitPence` + `computeSplit`) and the
backend (`microservices/core/.../finalize/computeBalances.ts`). The backend version distributes
each share with an independent `Math.round` on a float fraction, which can mis-sum (e.g. three
people sharing 1000 pence → 333 + 333 + 333 = 999, a lost penny), drops adjustments entirely,
and uses float fractions for custom splits — diverging from the prototype the mobile app will be
built against.

This feature extracts the prototype's algorithm into a single, framework-free, fully-typed
package, **`packages/split-engine`**, imported by **both** the backend (expense finalize) and the
mobile app (live review preview) so they compute **byte-for-byte identically**. It is small in
surface area but it is the **correctness keystone** of the product: if the engine is wrong, every
balance in the app is wrong.

Money is always **integer pence (minor units)**. All rounding uses **largest-remainder** so that
per-person shares **sum exactly** to the total. Custom splits use **integer share weights**
(e.g. `2 : 1`), not float fractions. Adjustments (tax / tip / discount) distribute **pro-rata** to
each person's assigned item subtotal; percentages are computed on the items subtotal; discounts
are negative.

After the engine ships, `microservices/core`'s `computeBalances` is replaced by an engine-backed
derivation, and its tests are updated/extended.

### Scope

- **In:** `splitPence`, `computeSplit`, a `balancesFromExpense` derivation that replaces
  `computeBalances`, the engine's types, exhaustive unit + property tests, and the integration of
  the engine into `microservices/core`'s finalize path.
- **Out:** UI rendering of splits (owned by `receipt-review-assignment`), DB persistence of
  shares (owned by `data-and-persistence`), netting/simplifying balances across multiple expenses
  (owned by `balances-and-settle-up`), multi-currency conversion.

### Glossary

- **Pence / minor units** — integer smallest currency unit. No fractional pence ever stored or
  returned.
- **Weights** — non-negative integers expressing relative share size for a single item.
- **Largest-remainder rounding** — floor every raw share, then hand the leftover pennies, one
  each, to the shares with the largest fractional remainders, until the total is reached.
- **Pro-rata** — distributed in proportion to each person's current assigned subtotal.
- **Assigned subtotal** — the sum of item amounts that have a valid assignment (items subtotal
  minus unassigned).

---

## Requirement 1 — Exact, exhaustive distribution of a single amount (`splitPence`)

**User Story:** As a developer integrating the split engine, I want a primitive that splits an
integer pence amount across integer weights, so that the returned shares always sum back to the
input with no penny created or lost.

#### Acceptance Criteria

1. WHEN `splitPence(total, weights)` is called with a non-empty `weights` array whose sum is
   greater than zero THE SYSTEM SHALL return an integer array of the same length whose elements
   sum **exactly** to `total`.
2. THE SYSTEM SHALL allocate each share as `floor(total * weight / sum)` and then distribute the
   remaining `total - sum(floors)` pennies, one per share, to the shares with the largest
   fractional remainders (largest-remainder rounding), matching `compute.jsx`.
3. WHERE two shares have equal fractional remainders THE SYSTEM SHALL break the tie
   deterministically by ascending index, so repeated calls with identical input return identical
   output.
4. IF the sum of `weights` is less than or equal to zero THEN THE SYSTEM SHALL return an array of
   zeros of the same length as `weights`.
5. WHERE `total` is negative (e.g. a discount being distributed) THE SYSTEM SHALL still return
   shares summing exactly to `total`, with the remainder distribution applied consistently.
6. THE SYSTEM SHALL preserve relative ordering of shares by weight (a strictly larger weight never
   receives a strictly smaller share than a smaller weight given the same total).

---

## Requirement 2 — Item-level split across all four assignment modes (`computeSplit`)

**User Story:** As a user reviewing a receipt, I want each line item split according to how I
assigned it (one / equal / everyone / custom), so that everyone is charged the right amount for
exactly what they consumed.

#### Acceptance Criteria

1. WHEN an item has assignment mode `one` THE SYSTEM SHALL charge the full item amount
   (`price * (qty || 1)`) to the single assigned member.
2. WHEN an item has assignment mode `equal` THE SYSTEM SHALL split the item amount across the
   listed members with equal weights, using largest-remainder rounding.
3. WHEN an item has assignment mode `everyone` THE SYSTEM SHALL split the item amount equally
   across **all** `memberIds` passed to `computeSplit`.
4. WHEN an item has assignment mode `custom` THE SYSTEM SHALL split the item amount across the
   members in `shares` using their **integer weights** (e.g. `2 : 1`), using largest-remainder
   rounding.
5. IF an item has no assignment, a null mode, or an empty target list THEN THE SYSTEM SHALL add
   the full item amount to `unassigned` and record an empty `sharesByItem` entry for that item.
6. THE SYSTEM SHALL return `sharesByItem[itemId]` mapping each charged member to their pence share
   for that item, so the split is fully explainable per line.
7. THE SYSTEM SHALL compute `itemsSubtotal` as the sum of all item amounts and `assignedSubtotal`
   as `itemsSubtotal - unassigned`.
8. THE SYSTEM SHALL guarantee that, ignoring adjustments, the sum over all members of their
   item-share contributions equals `assignedSubtotal` exactly.

---

## Requirement 3 — Pro-rata adjustments (tax / tip / discount)

**User Story:** As a user adding a service charge, tip, or discount to a receipt, I want it
apportioned in proportion to what each person already owes, so that nobody pays tip on items they
didn't have and the apportionment is transparent.

#### Acceptance Criteria

1. WHEN an adjustment has mode `fixed` THE SYSTEM SHALL use its `value` (in pence) as the
   adjustment amount.
2. WHEN an adjustment has mode `percent` THE SYSTEM SHALL treat `value` as **basis points** and
   compute its amount as `round(itemsSubtotal * value / 10000)`, computed on the **items subtotal**
   (not the adjusted/assigned subtotal).
3. WHERE an adjustment is of kind `discount` THE SYSTEM SHALL force its amount negative
   (`-abs(amount)`).
4. THE SYSTEM SHALL distribute each adjustment **pro-rata** across the members who currently hold
   a positive item share, weighted by each member's current share, using largest-remainder
   rounding so the distributed parts sum exactly to the adjustment amount.
5. IF no member currently holds a positive share (e.g. all items unassigned) THEN THE SYSTEM SHALL
   fall back to distributing the adjustment equally across all `memberIds`.
6. THE SYSTEM SHALL return `adjByPerson[memberId]` (the net adjustment pence applied to each
   member) and `adjustmentsTotal` (the signed sum of all adjustment amounts), and SHALL add each
   member's adjustment to their per-person total.
7. THE SYSTEM SHALL compute `total` as `itemsSubtotal + adjustmentsTotal`.

---

## Requirement 4 — Exact totals invariant and determinism

**User Story:** As the product owner, I want a hard guarantee that the parts always reconstruct
the whole, so that "no hidden math" is literally true and balances can never silently leak or
invent money.

#### Acceptance Criteria

1. THE SYSTEM SHALL guarantee that `sum(perPerson values) === assignedSubtotal + adjustmentsTotal`
   for any input (the assigned portion of the receipt is fully accounted for across members).
2. THE SYSTEM SHALL guarantee that `total === itemsSubtotal + adjustmentsTotal` and that
   `assignedSubtotal + unassigned === itemsSubtotal`.
3. THE SYSTEM SHALL be **pure and deterministic**: identical inputs always produce identical
   outputs, with no reliance on map/object key iteration order, randomness, wall-clock, or
   floating-point accumulation in the returned values (all returned money values are integers).
4. THE SYSTEM SHALL contain no framework, runtime, or platform dependencies (no React, no Node
   built-ins, no `window`/`globalThis`), so it runs unchanged under Vitest (backend) and the React
   Native / Hermes runtime (mobile).

---

## Requirement 5 — Confidence flag surfacing

**User Story:** As a user, I want the engine to tell me how many items still need a quick check,
so the review screen can show the "N items need a quick check" summary and block premature
finalize.

#### Acceptance Criteria

1. THE SYSTEM SHALL count, as `flagged`, the items whose confidence (`conf`) is present and below
   the low-confidence threshold (`< 0.7`, matching the prototype).
2. WHERE an item has no confidence value THE SYSTEM SHALL NOT count it as flagged.
3. THE SYSTEM SHALL return `flagged` as part of the `SplitResult` without altering any monetary
   field.

---

## Requirement 6 — Per-payer balances derived from a finalized expense (`balancesFromExpense`)

**User Story:** As the backend finalize handler, I want to derive who owes the single payer from a
finalized expense, so that the value I persist and return is computed by the same engine the
mobile preview used — replacing the divergent `computeBalances`.

#### Acceptance Criteria

1. THE SYSTEM SHALL expose a function that accepts a finalized `Expense` (single payer, items,
   adjustments) and the group's full `memberIds`, adapts them to the engine's input shape, runs
   `computeSplit`, and returns one `Balance` per **non-payer** member with a non-zero net amount.
2. THE SYSTEM SHALL set, on each returned balance, `fromMemberId` = the owing member,
   `toMemberId` = `expense.payerId`, `groupId` = `expense.groupId`, and `amount` = that member's
   net share (item shares plus their pro-rata adjustments) in pence.
3. WHERE `expense.payerId` itself holds a share THE SYSTEM SHALL exclude the payer from the
   returned balances (the payer does not owe themselves).
4. WHEN the expense includes `everyone` assignments THE SYSTEM SHALL resolve them against the
   provided `memberIds`; IF `memberIds` is empty THEN those items contribute nothing (no member to
   charge), consistent with the prior contract.
5. THE SYSTEM SHALL distribute adjustments into the per-payer balances via the engine's pro-rata
   rule, closing the gap where the old `computeBalances` ignored adjustments entirely.
6. THE SYSTEM SHALL return integer pence balances whose sum equals the total owed to the payer by
   others (i.e. `assignedSubtotal + adjustmentsTotal` minus the payer's own share), with no penny
   lost to rounding.

---

## Requirement 7 — Frontend/backend parity

**User Story:** As a user, I want the live preview on the review screen and the saved balances
from the backend to agree to the penny, so I never see the number change after I tap "Confirm &
save".

#### Acceptance Criteria

1. THE SYSTEM SHALL be the **single** source of split math: both `microservices/core` (finalize)
   and `packages/mobile` (live review preview) import `computeSplit`/`splitPence`/types from
   `packages/split-engine`.
2. WHEN the mobile preview and the backend finalize are given equivalent inputs for the same
   receipt THE SYSTEM SHALL produce identical `perPerson`, `sharesByItem`, and `total` values.
3. THE SYSTEM SHALL export TypeScript types (`Item`, `Assignment`, `Adjustment`, `SplitInput`,
   `SplitResult`, `MemberId`) so both consumers share one type contract and no consumer
   hand-rolls a duplicate.
4. THE SYSTEM SHALL be published as a workspace package consumable via the monorepo (Bun
   workspaces + Turbo) without bundling-specific configuration on either consumer.

---

## Requirement 8 — Migration of `microservices/core`

**User Story:** As a maintainer, I want the legacy `computeBalances` removed and its behaviour
provably preserved-or-improved, so the codebase has exactly one split implementation and the
finalize endpoint keeps working.

#### Acceptance Criteria

1. WHEN the finalize handler computes balances THE SYSTEM SHALL call the split-engine-backed
   `balancesFromExpense` instead of the local `computeBalances`.
2. THE SYSTEM SHALL remove `computeBalances.ts` once no code references it.
3. THE SYSTEM SHALL migrate `CustomShare` from a float `fraction` to integer share `weight`s in
   `microservices/core/src/domain/types.ts` and default `currency` to `GBP`, consistent with
   `steering/tech.md`.
4. THE SYSTEM SHALL keep the existing finalize handler tests passing — exact-amount cases (e.g.
   `one` → 450, `equal` → 800×3) SHALL continue to hold — and SHALL add cases for non-divisible
   amounts and for adjustments now flowing into balances.
5. IF the migration changes any externally observable balance for an exact-divisible input THEN
   THE SYSTEM SHALL be considered to have regressed and the change SHALL be rejected (the only
   intended behavioural change is correct rounding on non-divisible inputs and inclusion of
   adjustments).
