# Requirements — Receipt Review & Assignment (feature #7)

## Introduction

This feature delivers the **Review & assign** experience — the product's hero screen — plus the
**finalize** step that turns a draft expense into balances. After a receipt has been captured and
the AI has extracted line items (feature #6) and the split engine exists (feature #3), the user
lands on the Review screen, confirms or corrects every item's assignment, sees a live, fully
explainable split, and saves. Manual entry uses the **same** Review screen (no separate editor).

The experience embodies the product north stars: **AI suggests, the user confirms** (low-confidence
items are flagged, finalize is blocked until every item is assigned) and **no hidden split math**
(every per-person share, every adjustment apportionment, and the AI's own per-item reading are
visible and explainable). All money is integer pence. All split math is delegated to the canonical
`packages/split-engine` (feature #3) — this feature never reimplements `splitPence` / `computeSplit`.

Scope is one shippable PR, frontend-first: the mobile Review screen, Item editor bottom sheet,
the four assignment modes, the confidence summary, the adjustments pro-rata display, the live
preview, and the "how AI read your receipt" view — then the backend persistence of assignment/
adjustment edits and the finalize endpoint that computes balances via the split engine, then wire-up.

Dependencies: #3 shared-split-engine (split math + types), #5 groups-and-members (member list +
people-colour palette + accountless placeholders), #6 receipt-capture-extraction (draft expense with
items, per-item confidence, and the receipt image). Currency is GBP for V1.

---

## Requirement 1 — Review listing of the draft expense

**User Story:** As the person who paid, I want to see every extracted line item laid out with who
it's currently assigned to, so that I can confirm the AI got it right before saving.

#### Acceptance Criteria

1. WHEN the Review screen opens for a draft expense THE SYSTEM SHALL render a header showing "you paid"
   with the receipt total in `£x.xx`, the merchant name (when present), and the date.
2. THE SYSTEM SHALL render one row per receipt item showing its description, quantity, line amount
   (`unitPrice × quantity` formatted to `£x.xx`), and the current assignment summary.
   2a. WHERE items carry a `group_label` (e.g. "The wine round", extracted and stored by #6) THE
   SYSTEM SHALL render those items under a group header (matching the prototype's grouping) rather
   than ignoring the label; ungrouped items render flat.
3. WHERE an item is assigned, THE SYSTEM SHALL tint that row (left accent / badge) in the assigned
   person's people-palette colour; WHERE an item is split across multiple people THE SYSTEM SHALL
   indicate the multi-person assignment using their colours/initials.
4. WHEN the screen first opens after AI extraction THE SYSTEM SHALL show a dismissible "AI-filled"
   reveal toast indicating the items were pre-assigned by AI and still need confirmation.
5. WHEN the same screen is opened for a manually created draft (no AI extraction) THE SYSTEM SHALL
   present the identical layout with items unassigned and SHALL NOT show the AI-filled toast.

---

## Requirement 2 — The four assignment modes (incl. integer custom shares)

**User Story:** As a user, I want to assign each item to one person, split it between some people,
give it to everyone, or set custom shares, so that the split matches what actually happened.

#### Acceptance Criteria

1. WHEN the user taps an item row THE SYSTEM SHALL open the Item editor bottom sheet for that item
   with a segmented control offering **One · Split · Everyone · Custom**.
2. WHEN the user selects **One** and picks a member THE SYSTEM SHALL set the assignment to
   `{ type: "one", memberId }`.
3. WHEN the user selects **Split** and picks two or more members THE SYSTEM SHALL set the assignment
   to `{ type: "equal", memberIds }`.
4. WHEN the user selects **Everyone** THE SYSTEM SHALL set the assignment to `{ type: "everyone" }`,
   resolved against the group's full member list at compute/finalize time.
5. WHEN the user selects **Custom** THE SYSTEM SHALL present **integer share steppers** (e.g. 2 : 1),
   defaulting each picked member to a share of 1, and SHALL set the assignment to
   `{ type: "custom", shares: [{ memberId, weight }] }` with `weight` an integer ≥ 0.
6. THE SYSTEM SHALL allow assigning to **accountless placeholder members** in every mode, rendering
   them with their dashed-avatar treatment.
7. WHEN the user saves the Item editor THE SYSTEM SHALL clear that item's flag and unassigned state
   and reflect the new assignment summary and colour on the corresponding Review row.
8. WHERE the Item editor is opened on a manually-added item THE SYSTEM SHALL allow editing the
   description, quantity, and unit price (pence) alongside the assignment.

---

## Requirement 3 — Confidence summary and jump-to-flag

**User Story:** As a user, I want the app to point me at the items the AI was unsure about, so that
I can quickly check just those instead of re-reading the whole receipt.

#### Acceptance Criteria

1. WHERE one or more items are flagged (AI confidence below the extraction threshold) or unassigned,
   THE SYSTEM SHALL show a top-of-list summary reading "N items need a quick check".
2. THE SYSTEM SHALL render a per-item amber "check this" indicator on every flagged or unassigned row.
3. WHEN the user taps the summary THE SYSTEM SHALL scroll/focus the **first** flagged or unassigned
   item and (where applicable) open its Item editor.
4. WHEN an item's flag is cleared (by confirming/editing its assignment) THE SYSTEM SHALL decrement
   the summary count and remove that row's amber indicator.
5. WHEN no items remain flagged or unassigned THE SYSTEM SHALL hide the summary entirely.

---

## Requirement 4 — Adjustments shown pro-rata and transparently

**User Story:** As a user, I want service charge / tax / tip / discount to be split fairly in
proportion to what each person ordered, and to see that it's happening, so that I trust the totals.

#### Acceptance Criteria

1. THE SYSTEM SHALL render each receipt adjustment (e.g. "Service charge · 12.5%") with its label
   and resolved pence amount; percentage adjustments SHALL be computed on the items subtotal.
2. THE SYSTEM SHALL display a "split pro-rata" chip and an explanatory footnote stating that
   adjustments are apportioned to each person in proportion to their assigned item subtotal.
3. THE SYSTEM SHALL treat discounts as negative amounts in the displayed and computed totals.
4. WHEN the user adds, edits, or removes an adjustment THE SYSTEM SHALL recompute the live preview
   and persist the change to the draft expense.

---

## Requirement 5 — Live split preview correctness

**User Story:** As a user, I want to see exactly what each person owes update instantly as I assign
items, so that there's no hidden math and the numbers always add up.

#### Acceptance Criteria

1. THE SYSTEM SHALL compute the live preview exclusively via `packages/split-engine`
   (`computeSplit`), never with a local reimplementation.
2. WHEN any assignment, adjustment, item amount, or quantity changes THE SYSTEM SHALL recompute and
   re-render the per-person amounts, the unassigned amount, and the receipt total.
3. THE SYSTEM SHALL display each per-person amount in `£x.xx`, and THE SYSTEM SHALL guarantee (via
   the engine's largest-remainder rounding) that the sum of per-person amounts equals the receipt
   total exactly with no fractional pence.
4. WHERE any item is unassigned THE SYSTEM SHALL surface the unassigned pence amount distinctly
   (amber) in the live preview.

---

## Requirement 6 — Blocked finalize until fully assigned

**User Story:** As a user, I want the app to stop me from saving while items are still unassigned,
so that I never finalize an incomplete or wrong split.

#### Acceptance Criteria

1. WHILE any item in the draft is unassigned THE SYSTEM SHALL disable the Confirm & save action and
   label it to prompt completion (e.g. "Assign all items").
2. WHEN every item is assigned THE SYSTEM SHALL enable the Confirm & save action labelled
   "Confirm & save".
3. IF a finalize request reaches the backend while any item is unassigned THEN THE SYSTEM SHALL
   reject it with a validation error and SHALL NOT change the expense status.
4. THE SYSTEM SHALL never finalize an expense automatically; finalize SHALL require an explicit
   user action.

---

## Requirement 7 — Persisting assignment and adjustment edits

**User Story:** As a user, I want my assignment and adjustment edits to stick, so that the draft I
come back to reflects exactly what I last did.

#### Acceptance Criteria

1. WHEN the user saves an item assignment THE SYSTEM SHALL persist it to the draft expense via the
   update-assignment endpoint and return the updated expense.
2. WHEN the user adds, edits, or removes an adjustment THE SYSTEM SHALL persist the full adjustments
   set to the draft expense via the update-adjustment endpoint and return the updated expense.
3. THE SYSTEM SHALL scope every read and write to the authenticated user and their membership of the
   expense's group; IF the user is not a member of that group THEN THE SYSTEM SHALL respond 403/404
   and SHALL NOT mutate any data.
4. IF the targeted expense or item does not exist THEN THE SYSTEM SHALL respond 404 without mutating
   data.
5. THE SYSTEM SHALL reject assignment or adjustment writes against an expense whose status is already
   `finalized`.

---

## Requirement 8 — Finalize persistence and balance computation

**User Story:** As the payer, I want saving to lock in the split and tell everyone what they owe me,
so that the group has an agreed record.

#### Acceptance Criteria

1. WHEN a valid finalize request is received for a fully-assigned draft THE SYSTEM SHALL transition
   the expense status from `draft` to `finalized`.
2. THE SYSTEM SHALL compute per-member balances using `packages/split-engine`, applying pro-rata
   adjustment apportionment and resolving `everyone` against the group's member list.
3. THE SYSTEM SHALL persist the computed balances (others owe the single payer) and return both the
   finalized expense and the balances.
4. THE SYSTEM SHALL exclude the payer from owing themselves in the computed balances.
5. IF finalize is requested for an expense that is already `finalized` THEN THE SYSTEM SHALL respond
   idempotently (return the existing finalized expense + balances) without recomputing a different
   result.

---

## Requirement 9 — "How AI read your receipt" explainability

**User Story:** As a user, I want to see how the AI mapped lines on the photo to people, so that I
understand and trust why each item was assigned the way it was.

#### Acceptance Criteria

1. WHEN the user taps the receipt-thumbnail / "how AI read your receipt" control THE SYSTEM SHALL
   open a view listing each extracted line tinted in the assigned person's people-palette colour.
2. WHERE a line is assigned to everyone THE SYSTEM SHALL render the "everyone" treatment (star / ALL)
   rather than a single person's colour.
3. WHERE a line is unassigned or low-confidence THE SYSTEM SHALL tint it amber to match its flagged
   state on the Review screen.
4. THE SYSTEM SHALL present a legend explaining the colour-to-person and everyone mappings.
5. THE SYSTEM SHALL render this view read-only; editing happens via the Item editor on the Review
   screen.
