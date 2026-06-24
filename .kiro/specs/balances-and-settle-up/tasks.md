# Tasks — Balances & Settle-up

> One PR. Frontend-first: build screens against a typed mock client, then the backend
> (aggregation via `packages/split-engine`, settlements + activity repos/handlers), then wire
> the real Eden client and add integration tests. Each task is code/test and builds on the
> previous. Settle-up is **record-keeping only** — no money movement anywhere.

## Phase 1 — Contract & typed mocks

- [ ] 1. Add the API contract types to the shared boundary: `BalancesResponse`,
     `CreateSettlementBody`, `Settlement`, `ActivityEntry`/`ActivityResponse` (integer pence,
     GBP). Place them where the Elysia app can export them via Eden so FE consumes inferred types,
     not hand-written copies. _Requirements: 1.6, 2.1, 3.2, 5.2_

- [ ] 2. Build a typed mock client under `packages/mobile/src/adapters/api/mock/` returning
     fixtures for `getGroupBalances`, `createSettlement`, `listSettlements`, `getActivity` —
     including a `--pos` group, a `--neg` group, an all-settled group, and activity entries with
     `settled` flags (mirroring the prototype `data.jsx`). _Requirements: 2.2, 2.3, 4.1, 5.5_

## Phase 2 — Mobile UI against the mock

- [ ] 3. Build `BalancesScreen` hero: signed `yourPositionPence` rendered with `--pos` when
     positive ("owed to you"), `--neg` when negative ("you owe"), neutral `£0.00` when zero, plus
     the "N still to settle" count. _Requirements: 2.1, 2.2, 2.3, 2.6, 4.2_

- [ ] 4. Add the per-person breakdown to `BalancesScreen`: a "who owes you" list and a "you
     owe" list, each row using the people-palette `Avatar`, member name, and `£x.xx` amount;
     label accountless placeholder members as invitable. _Requirements: 2.4, 2.5_

- [ ] 5. Add the all-settled empty state and the persistent footnote "V1 records payments — no
     money actually moves" to `BalancesScreen`. _Requirements: 3.3, 4.1, 4.2_

- [ ] 6. Build `SettleUpSheet`: from→to avatars, direction copy ("X pays you" / "you pay X"),
     outstanding amount, and a **Mark as paid** action that calls `createSettlement` on the mock,
     then shows the settled confirmation. _Requirements: 3.1, 3.2, 3.3_

- [ ] 7. Wire local recompute: on a recorded settlement, invalidate the balances + activity
     queries so the pair flips to settled and the screen transitions to all-settled when the last
     net clears (no full reload). _Requirements: 3.4, 4.3_

- [ ] 8. Build `ActivityFeed` (Home = all groups, group screen = one group): rows with actor
     `Avatar`, text line, optional `£x.xx`, relative time, newest-first; settlement rows get the
     `--pos` settled treatment. _Requirements: 5.3, 5.4, 5.5, 5.6_

- [ ] 9. Component tests (Jest + RN Testing Library) for tasks 3–8 against the mock:
     pos/neg/neutral position colours, breakdown + placeholder labelling, all-settled state,
     mark-as-paid flow + query invalidation, "no money moves" footnote, feed ordering/styling.
     _Requirements: 2.2, 2.3, 2.4, 3.3, 4.1, 5.3, 5.5_

## Phase 3 — Backend aggregation via the split engine

- [ ] 10. Create `balancesService.computeForGroup(groupId, userMemberId)` in
      `microservices/core/src/application/balances/`: load `finalized` expenses only, expand each
      single-payer expense into `member → payer` obligations via `packages/split-engine`
      (`computeSplit`), and accumulate a pairwise net ledger. Replace the legacy
      `finalize/computeBalances.ts` usage. _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 11. Extend the service to subtract recorded settlements from the pair ledger, emit only
      non-zero net pairs (`amount > 0`, `from` owes `to`), compute the user's signed position +
      `pairsToSettle`, and set `allSettled`. _Requirements: 1.4, 1.5, 1.6, 2.1, 4.1_

- [ ] 12. Add `balancesHandler` `GET /groups/:groupId/balances`: assert membership from the
      verified JWT, call the service, return `BalancesResponse`; 404/not-authorized for
      non-members. _Requirements: 6.1, 6.2, 6.4_

- [ ] 13. Unit-test `balancesService`: single + multi-expense netting, pro-rata adjustments
      with exact summation (Σ shares == total, no rounding drift), zero-net omission, all-settled,
      settlement subtraction, draft exclusion. _Requirements: 1.1, 1.3, 1.4, 1.5, 4.1_

## Phase 4 — Settlements repository + handler

- [ ] 14. Implement `SettlementsRepository` (`microservices/core/src/application/settlements/`)
      against `packages/db` `settlements` table: `create`, `listByGroup`, with ownership/membership
      scoping. _Requirements: 3.2, 6.1, 6.3_

- [ ] 15. Implement `settlementsService.record(...)`: validate non-self pair, amount > 0, both
      members in group, and `amount ≤ live outstanding net` (recompute net in-request to avoid
      stale overpay); persist; then append an activity entry. _Requirements: 3.2, 3.4, 3.5, 3.6_

- [ ] 16. Add `settlementsHandler`: `POST /groups/:groupId/settlements` (validate body, derive
      actor from JWT, never from body) and `GET /groups/:groupId/settlements`. Reject inaccessible
      member/group. _Requirements: 3.5, 3.7, 6.2, 6.3, 6.4_

- [ ] 17. Unit + handler tests: records with timestamp; rejects over-net, zero/negative,
      self-pair, non-member; appends activity; membership scoping; actor from token. _Requirements:
      3.2, 3.5, 3.6, 3.7, 6.4_

## Phase 5 — Activity repository + handler

- [ ] 18. Implement `ActivityRepository` (`microservices/core/src/application/activity/`)
      against `packages/db` `activity` table: `append`, `listByUser` (all groups), `listByGroup`,
      newest-first. _Requirements: 5.2, 5.3, 5.4_

- [ ] 19. Emit activity entries at the source events: `expense_added` on finalize,
      `member_joined` on join (hook into the existing finalize and groups/members flows), and
      `settlement` from the settlements service (task 15). _Requirements: 5.1, 5.5_

- [ ] 20. Add `activityHandler`: `GET /activity` (user's groups) and
      `GET /groups/:groupId/activity`, both scoped to the verified user. _Requirements: 5.3, 5.4,
      6.1, 6.2_

- [ ] 21. Unit + handler tests: ordering newest-first, Home vs group scoping, settlement
      `settled` flag, entries created on finalize/settlement/join, ownership scoping. _Requirements:
      5.1, 5.3, 5.4, 5.5, 6.2_

## Phase 6 — Wire real client + integration

- [ ] 22. Replace the mobile mock client with the real Eden-typed client for balances,
      settlements, and activity; remove the mock; keep TanStack Query keys/invalidation intact.
      _Requirements: 1.6, 3.4, 5.3_

- [ ] 23. Integration tests across FE→BE: finalize an expense → balances reflect the new
      obligation; record a settlement → net drops and an activity entry appears; settle the last
      pair → screen shows all-settled. Confirm no endpoint/path represents money movement.
      _Requirements: 1.2, 3.3, 3.4, 4.3, 5.1_

- [ ] 24. Verify quality gates green: typecheck/lint/prettier, Vitest + mobile Jest at the
      coverage threshold, CI passes; the three screens work end-to-end against the real backend.
      _Requirements: 1.1, 2.1, 3.2, 5.3, 6.1_
