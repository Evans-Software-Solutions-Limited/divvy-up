# Tasks — Receipt Review & Assignment (feature #7)

Frontend-first, one PR. Build the Review screen + Item editor + live preview against typed mock data,
then mode interactions + confidence + adjustments + blocked-confirm, then backend persistence +
finalize via the split engine, then wire the real client + integration tests. The API/type contract
is fixed in `design.md` (note the custom-assignment `weight` reconciliation).

---

## Frontend — build against typed mock data

- [ ] **1. Typed mock + review state scaffold.** In `packages/mobile/src/features/receipt-review/`
      add a typed mock eden client and a `useReviewState` hook holding working items/adjustments and
      exposing the `computeSplit` result, `flaggedCount`, `unassignedPence`, and `canFinalize`. Import
      `packages/split-engine` for all math; no local arithmetic. _Requirements: 5.1_

- [ ] **2. Review screen shell + item rows.** Build `ReviewScreen` (header "you paid" + total +
      merchant + date) and `ItemRow` rendering description/qty/line amount and the assignment summary,
      with rows tinted by the assigned person's people-palette colour (multi-person shows their
      colours/initials). _Requirements: 1.1, 1.2, 1.3_

- [ ] **3. AI-filled reveal toast.** Add the dismissible AI-filled toast shown for AI-extracted
      drafts and suppressed for manual drafts. _Requirements: 1.4, 1.5_

- [ ] **4. Item editor sheet + assignment control.** Build `ItemEditorSheet` (name/qty/price-pence
      steppers for manual/edited items) and `AssignmentControl` with the segmented
      `One · Split · Everyone · Custom`, per-mode caption, and member picker (incl. accountless
      placeholders with dashed avatars). Save emits a typed `ItemAssignment` and updates the row.
      _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 2.7, 2.8_

- [ ] **5. Custom integer share steppers.** Implement Custom mode as integer share steppers
      (default 1 per picked member, e.g. 2 : 1), emitting `{ type: "custom", shares: [{ memberId, weight }] }`
      with integer weights. _Requirements: 2.5_

- [ ] **6. Live split bar.** Build `LiveSplitBar` showing per-person amounts (£x.xx, colour-coded),
      the unassigned amount in amber, and the total — all recomputed via the engine on every change,
      with per-person sum guaranteed to equal the total. _Requirements: 5.2, 5.3, 5.4_

- [ ] **7. Confidence summary + jump-to.** Build `ConfidenceSummary` ("N items need a quick check")
      and the per-row amber "check this" indicator; tapping the summary scrolls to and opens the first
      flagged/unassigned item; count decrements on clear and the summary hides at 0. _Requirements: 3.1,
      3.2, 3.3, 3.4, 3.5_

- [ ] **8. Adjustments block.** Build `AdjustmentsBlock` listing each adjustment with label +
      resolved pence (percent on items subtotal, discounts negative), the "split pro-rata" chip and
      footnote; add/edit/remove updates working state and triggers recompute. _Requirements: 4.1, 4.2,
      4.3, 4.4_

- [ ] **9. Blocked Confirm & save.** Wire the footer button: disabled + "Assign all items" while any
      item is unassigned; enabled + "Confirm & save" when complete; never auto-finalizes.
      _Requirements: 6.1, 6.2, 6.4_

- [ ] **10. "How AI read your receipt" sheet.** Build read-only `HowAIReadSheet` from the
      receipt-thumbnail control: each line tinted by assignee colour (everyone = ★, unassigned/low-conf
      = amber) plus a legend. _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] **11. Frontend unit tests.** Jest + RN Testing Library against the mock client: assignment-mode
      outputs incl. integer custom weights, row tinting, toast show/suppress, confidence count + jump,
      adjustments pro-rata/discount display, live-preview sum-equals-total (using the real engine),
      confirm enable/disable, how-AI-read tinting. _Requirements: 1, 2, 3, 4, 5, 6, 9_

---

## Backend — persistence + finalize via split engine

- [ ] **12. Assignment contract reconciliation + persistence.** Update the `items/assignment`
      handler schema and `domain/types.ts` custom shape to integer `weight`; add group-membership
      scoping and a `finalized`-status guard; persist via `ExpensesRepository.updateItemAssignment`.
      _Requirements: 2.5, 7.1, 7.3, 7.4, 7.5_

- [ ] **13. Update-adjustments endpoint.** Add `PUT /expenses/:id/adjustments` handler + repository
      `updateAdjustments` replacing the full adjustments array, with the same scoping + status guards.
      _Requirements: 4.4, 7.2, 7.3, 7.4, 7.5_

- [ ] **14. Finalize via split engine.** Replace `computeBalances` usage so finalize computes
      per-member balances through `packages/split-engine` (pro-rata adjustments, `everyone` resolved
      against `memberIds`, payer excluded); persist status `draft→finalized` and the balances; return
      `{ expense, balances }`. _Requirements: 8.1, 8.2, 8.3, 8.4_

- [ ] **15. Finalize guards.** Reject finalize with `422 { error, unassignedItemIds }` when any item
      is unassigned (status unchanged); make re-finalizing a finalized expense idempotent.
      _Requirements: 6.3, 8.5_

- [ ] **16. Backend handler tests.** Vitest: assignment persistence per mode incl. integer weights +
      `403/404/409`; adjustments replace + guards; finalize `422`/success/idempotent/payer-excluded with
      balances from the engine. _Requirements: 2, 4, 6, 7, 8_

---

## Wire-up — real client + integration

- [ ] **17. Wire the eden client.** Replace the mock with the real eden/treaty client in
      `useReviewState`; persist assignment + adjustment edits, finalize on confirm, apply optimistic
      updates with rollback on non-2xx and a non-blocking error toast. _Requirements: 7.1, 7.2, 7.3, 8.1_

- [ ] **18. Integration test.** Drive the mobile hook against the real `core` app: assign all items
      → adjustments persist → finalize returns balances whose per-person sum equals the receipt total;
      assert finalize is blocked end-to-end while unassigned. _Requirements: 5.3, 6.3, 7, 8_
