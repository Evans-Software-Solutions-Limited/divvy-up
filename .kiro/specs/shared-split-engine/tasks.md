# Tasks — Shared Split Engine (`packages/split-engine`)

Incremental, test-first coding tasks. Each builds on the previous. This feature is one shippable
PR. Because the engine has no UI, "frontend-first" here means: define the **shared type contract**
first (the FE↔BE bridge), then the primitive, then the engine, then the domain adapter, then the
backend integration. Mobile consumes the same package via the contract.

- [ ] **1. Scaffold `packages/split-engine` as a workspace package**
  - Create `packages/split-engine/` with `package.json` (name `@divvy-up/split-engine`, ESM,
    `types`/`main` wired to `src`/`dist`), `tsconfig.json` extending the repo base with
    `declaration: true`, and `vitest.config.ts` with v8 coverage at the repo threshold.
  - Add the package to the Bun workspace + Turbo pipeline so `bun test` / `turbo run test` pick it
    up. Confirm an empty `src/index.ts` typechecks and an empty Vitest run passes.
  - _Requirements: 4.4, 7.4_

- [ ] **2. Define the shared type contract (`src/types.ts`) and re-export from `index.ts`**
  - Add `MemberId`, `AssignMode`, `Assignment` (one/equal/everyone/custom with **integer-weight**
    `shares`), `Item`, `Adjustment` (kind + fixed/percent mode), `SplitInput`, `SplitResult`
    exactly as in `design.md` (Data Models). No `any` in the public surface.
  - Re-export all types and (placeholder) function names from `src/index.ts`.
  - _Requirements: 2.1–2.4, 3.1–3.3, 7.3_

- [ ] **3. Port `splitPence` (`src/splitPence.ts`) + exhaustive tests**
  - Port largest-remainder rounding literally from `compute.jsx`: floor each `total*w/sum`, then
    distribute leftover pennies by descending fractional remainder, ascending-index tie-break.
  - Tests (`__tests__/splitPence.test.ts`): even/exact/non-divisible/weighted division, leftover
    > 1, tie-break determinism, idempotence, empty/zero/`sum<=0` → zeros, and negative total
    > (discount) summing exactly.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [ ] **4. Port `computeSplit` (`src/computeSplit.ts`) + mode and adjustment tests**
  - Port the item loop (`price * (qty||1)`, four modes, unassigned handling, `sharesByItem`) and
    the pro-rata adjustment loop (percent on items subtotal, fixed, discount negative, pro-rata by
    current share via `splitPence`, equal fallback when no positive shares). Compute
    `itemsSubtotal`, `assignedSubtotal`, `adjustmentsTotal`, `total`, `flagged` (`conf < 0.7`).
  - Tests (`__tests__/computeSplit.test.ts`): each of the four modes in isolation; qty handling;
    unassigned accumulation; mixed percent+fixed+discount adjustments with pro-rata weighting;
    all-unassigned equal fallback; `flagged` counting (ignores missing `conf`, never alters money).
  - _Requirements: 2.1–2.8, 3.1–3.7, 5.1, 5.2, 5.3_

- [ ] **5. Add the property-based sum-invariant test (`__tests__/invariants.property.test.ts`)**
  - Using fast-check (add as devDep) or a seeded generative loop, generate arbitrary
    items/adjustments/members and assert: `Σ splitPence === total` (or zeros); `assignedSubtotal +
unassigned === itemsSubtotal`; `total === itemsSubtotal + adjustmentsTotal`; `Σ perPerson ===
assignedSubtotal + adjustmentsTotal`; every money value is an integer; `computeSplit` is
    deterministic (deep-equal on repeat).
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] **6. Migrate domain types in `microservices/core/src/domain/types.ts`**
  - Change `CustomShare.fraction: number` (float) → `CustomShare.weight: number` (integer) and
    default `Expense.currency` from `"USD"` → `"GBP"`. Update any references/fixtures that set
    `fraction` or rely on the USD default to compile.
  - _Requirements: 8.3_

- [ ] **7. Implement `balancesFromExpense` (`src/balancesFromExpense.ts`) + tests**
  - Map `Expense` → `SplitInput` per the `design.md` mapping tables (assignment + adjustment
    conversion, `unitPrice→price`, `quantity→qty`, `CustomShare.weight` → `{id: weight}`), run
    `computeSplit`, drop the payer, and emit one `Balance` per non-payer with a non-zero net
    (`fromMemberId`=member, `toMemberId`=payerId, `groupId`, integer `amount`).
  - Tests (`__tests__/balancesFromExpense.test.ts`): parity with a hand-built `SplitInput`; payer
    excluded; zero-net excluded; adjustments flow into balances; `everyone` resolved via
    `memberIds` and empty `memberIds` charges nobody; returned balances sum to total owed to payer.
  - Export from `index.ts`.
  - _Requirements: 6.1–6.6, 7.1, 7.2_

- [ ] **8. Integrate the engine into `microservices/core` finalize (replace `computeBalances`)**
  - Add `@divvy-up/split-engine` as a dependency of `microservices/core`. In
    `expensesFinalizeHandler.ts`, replace `import { computeBalances }` and its call with
    `balancesFromExpense(expense, body?.memberIds ?? [])`.
  - Delete `computeBalances.ts` once unreferenced (`grep` confirms no other usage).
  - _Requirements: 7.1, 8.1, 8.2_

- [ ] **9. Update & extend `microservices/core` finalize tests**
  - Keep the existing exact-divisible cases green (`one`→450, `equal`→800×3, `everyone`→300×3) to
    prove no regression. Add: a non-divisible `equal` split (e.g. item 1000 across 3) asserting the
    per-member shares sum exactly to the item total; an expense with a percent service charge
    asserting the adjustment now appears apportioned in the balances.
  - Run typecheck, lint, prettier, and the full `core` + `split-engine` test suites; confirm CI is
    green at the coverage bar.
  - _Requirements: 8.4, 8.5_
