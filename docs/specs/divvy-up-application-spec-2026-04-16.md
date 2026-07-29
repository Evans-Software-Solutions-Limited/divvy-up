# Divvy Up — Application Spec and Product Direction

Date: 2026-04-16
Owner: Bradley Evans
Prepared by: Axel
Status: Draft foundation spec for later task decomposition

## 1. Purpose of this document

This document defines what Divvy Up currently is, what is already present in the repo, what the near-term product should handle, and how adjacent document-extraction ideas fit without muddying the product.

This is intentionally a product/application spec, not an implementation task list. The next step after review is to split this into spec-driven requirements/design/tasks for the coding lane.

---

## 2. Repo snapshot, current application status

Based on the current checked files in the repo, Divvy Up is positioned as a lightweight mobile-first shared expense app for small groups, trips, and household costs, with receipt scanning and item-level split assignment as the core differentiator.

### 2.1 Current intended product shape

Current docs position Divvy Up as:
- mobile-first shared expense tracking
- group-based expense management
- receipt upload/capture
- OCR/vision extraction into structured line items
- item-level split assignment
- receipt-level adjustments (tax, tip, discount)
- balance calculation after expense finalization

### 2.2 Current implemented or scaffolded slices

#### Web app
- React/Vite web companion exists
- routes currently include:
  - `/` — groups home
  - `/balances` — placeholder balances page
  - `/receipts/:id/review` — receipt review screen
  - `/login` — placeholder page
- `Home.tsx` fetches groups from the backend API
- `ReceiptReview.tsx` is currently mock-driven and demonstrates the intended UX well, but is not yet wired to backend-backed receipt data
- `Balances.tsx` is still placeholder-level
- `Login.tsx` is still boilerplate-level

#### Core backend service
- Elysia/Hono Lambda entrypoint exists
- current endpoints include:
  - `GET /groups`
  - `POST /expenses`
  - `PUT /expenses/:id/items/:itemId/assignment`
  - `POST /expenses/:id/finalize`
- core domain types exist for:
  - groups
  - members
  - expenses
  - receipt items
  - item assignments
  - receipt adjustments
  - balances
- `ExpensesRepository` is currently in-memory, not database-backed
- `GroupsRepository` is currently stubbed and returns an empty list
- `computeBalances` exists, but backend explicitly does not yet distribute tax/tip/discount in balance calculation

#### Receipt extraction service
- separate receipt extraction service exists
- endpoint exists:
  - `POST /receipts/extract`
- extraction currently returns mock OCR results keyed by image key prefix
- response shape includes:
  - merchant
  - date
  - currency
  - subtotal
  - tax
  - tip
  - total
  - items[]
  - rawText (optional)
  - groupId (optional)

### 2.3 Current status summary

Divvy Up is beyond a blank scaffold, but not yet an honest end-to-end product.

It currently has:
- a clear product shape
- working domain scaffold
- API contracts for the main expense flow
- a strong mocked review UI
- mock OCR extraction

It does not yet have:
- real persistence
- real receipt-review wiring from backend data
- backend/UI agreement on tax/tip/discount behavior
- finished balances flow
- group creation/member management flow wired through UI
- real auth/user identity
- real mobile app implementation confirmed in the current checked files

So the truthful description today is:

**Divvy Up is a promising shared-expense application scaffold with a compelling receipt review interaction, but the key user journey is still only partially wired and not yet production-trustworthy.**

---

## 3. Product definition

## Core product statement

Divvy Up helps small groups turn messy real-world receipts into clear, reviewable, item-level shared expenses, so users can quickly decide who owes what without doing mental arithmetic or spreadsheet admin.

## Core promise

- scan or upload a receipt
- get line items extracted automatically
- review and assign each item to the right people
- finalize once the split looks right
- see exact balances clearly

## Product principles

- AI suggests, user confirms
- the receipt review experience must be fast and trustworthy
- balance math must be transparent
- backend must own the financial truth
- the product should feel lightweight and everyday, not enterprise-heavy in the first slice

---

## 4. Primary users

### Primary V1 users
- friends splitting meals, trips, or shared purchases
- couples or housemates splitting home costs
- small informal groups who want receipt-based clarity, not a finance tool

### Secondary possible users later
- small clubs or communities
- lightweight team/shared expenses for startups or small businesses
- bookkeepers or ops users processing receipts/invoices, if the product expands deliberately in that direction

---

## 5. Core user problems

### Problem 1: receipts are awkward to split
Users can easily divide a total bill evenly, but real shared receipts are rarely evenly split. People buy different items, one person pays, and tax/tip/discount complicate the math.

### Problem 2: manual split logic is annoying and error-prone
Users often use chat messages, notes, or spreadsheets to work out who owes what. This is slow, annoying, and easy to get wrong.

### Problem 3: OCR-only tools do not solve the assignment problem
Many tools can read a receipt, but they stop at extraction. The real user job is deciding how each line item maps to people, then getting a trustworthy balance result.

### Problem 4: users need confidence before finalizing money
If the split feels hidden or arbitrary, users will not trust it. Divvy Up must show a reviewable trail from receipt → items → assignments → balances.

---

## 6. Near-term product scope, what Divvy Up should handle

## 6.1 Primary near-term scope

Divvy Up should handle the full shared-expense workflow for receipts:

1. Create group
2. Add members
3. Start an expense
4. Upload or capture receipt image
5. Run extraction
6. Review extracted items
7. Edit/fix extraction if needed
8. Assign line items
   - one person
   - equal split among selected people
   - everyone
   - custom shares
9. Apply receipt-level adjustments
   - tax
   - tip/service charge
   - discount
10. Finalize expense
11. Compute balances
12. Show group-level or expense-level who-owes-what summary

## 6.2 Minimum trustworthy product slice

The first fully honest product milestone should be:

- real group can be selected or created
- real receipt extraction data is used in review flow
- review UI is backend-backed, not page-local mocks
- finalization uses backend-owned balance logic
- UI reflects backend truth precisely
- tax/tip/discount behavior is either fully implemented or honestly constrained
- finalized expense can be revisited and inspected

This is the real line between “scaffold” and “product”.

---

## 7. Explicit near-term out of scope

The following remain out of scope for the first meaningful product phase:

- bank integrations
- direct money movement
- budgeting dashboards
- multi-currency settlement engine
- full offline sync
- social/chat feed
- full enterprise AP workflow
- broad contract/document intelligence product surface

These may become future avenues, but they should not be smuggled into the first core slice.

---

## 8. Extension path, how the new document extraction idea fits

The new invoice/document extraction idea is not random. It naturally extends the existing receipt extraction and review model.

However, it sits across two possible directions:

### Direction A, keep Divvy Up tightly consumer/shared-expense focused
In this direction, document intelligence is only extended where it helps shared expenses.

Examples:
- receipts from different merchants and formats
- subscription receipts
- home/household bills split across housemates
- event/trip purchase receipts
- lightweight recurring shared bills

This keeps Divvy Up coherent and easy to explain.

### Direction B, expand Divvy Up into a broader expense/document review product
In this direction, Divvy Up becomes a wider document-to-structured-expense workflow system.

Examples:
- invoices
- purchase orders
- expense receipts
- contracts with key dates and payment terms
- review queues for flagged documents
- validation against schemas or internal rules

This is commercially interesting, but it changes the product category. It starts to push Divvy Up from a consumer/shared-expense app toward a lightweight finance/document operations product.

## Recommendation

Do not blur these directions accidentally.

For now:
- **Divvy Up core product** should remain receipt-led shared expenses
- **document extraction extension** should be captured as a deliberate Phase 2 / product expansion hypothesis
- if it becomes the dominant use case, we should explicitly decide whether Divvy Up is evolving into a new category or whether it should spawn a separate B2B product/service

---

## 9. Proposed product roadmap

## Phase 1, honest shared-expense product

### Goal
Make Divvy Up trustworthy end-to-end for receipt-based shared expenses.

### Outcomes
- real backend-backed receipt review flow
- backend-owned balances
- consistent tax/tip/discount handling
- persistence for groups/expenses/items/assignments
- usable web companion
- mobile story clarified and aligned

### Definition of success
A real user can split a restaurant/trip/household receipt from upload to final balances without mock data or hidden logic.

## Phase 1.5, usability and reliability

### Outcomes
- editing extracted line items
- better empty/loading/error states
- saved group history
- finalized expense audit trail
- basic authentication/user identity
- more robust OCR fallback and manual correction

## Phase 2, advanced expense intelligence

### Potential outcomes
- recurring/shared bills
- merchant normalization
- category tagging
- smarter extraction correction
- confidence flags on ambiguous items
- review queues for low-confidence extraction

This phase still fits the current Divvy Up identity if kept centered on shared expenses.

## Phase 3, deliberate document expansion

### Candidate features
- invoice extraction
- receipt + invoice unification
- contract date/payment extraction
- validation rules against schemas
- exception review queue
- export to spreadsheets or finance systems

### Important decision gate
Before this phase starts, explicitly decide:
- Is Divvy Up still a shared-expense product?
- Or is it becoming a B2B document workflow product?

That decision affects naming, UX, pricing, buyer, and architecture.

---

## 10. Detailed feature spec, Phase 1

## 10.1 Groups

Users can create a group and manage members.

### Must support
- group creation
- member list
- adding/removing members
- stable member identities within group

### Not yet required
- advanced permissions
- complex roles
- multi-admin systems

## 10.2 Expense creation

Users can create an expense tied to a group and payer.

### Must support
- payer selection
- date
- merchant (optional/manual or extracted)
- currency
- receipt image reference

## 10.3 Receipt ingestion

Users can upload or capture a receipt image.

### Must support
- file/image upload
- image storage key
- extraction request against receipt service
- extracted structured response returned to review flow

### Honest constraints
- OCR may be imperfect
- user must be able to correct extracted values

## 10.4 Receipt review and correction

This is the center of the product.

### Must support
- viewing extracted merchant/date/currency/totals/items
- editing extracted line items
- adding/removing line items manually when extraction fails
- clear subtotal/adjustments/total visibility

## 10.5 Item assignment

### Must support
- assign to one person
- split equally among selected members
- split among everyone
- custom fractional split

### Product rule
Assignment UX must feel fast. If assignment becomes fiddly, the product loses its main advantage.

## 10.6 Adjustments

### Must support
- tax
- tip/service charge
- discount

### Critical requirement
The treatment of adjustments must be defined once and implemented consistently in backend and UI.

We should not allow:
- UI showing one balance outcome
- backend finalization producing another

## 10.7 Balance calculation

### Must support
- pairwise balances from finalized expense
- clear payer relationship
- deterministic rounding rules
- user-visible explanation if needed

### Important design rule
Backend owns balance truth. Frontend may preview, but preview must match backend exactly.

## 10.8 Balances view

### Must support
- per-expense balance summary
- group-level view of who owes what
- clear amount formatting
- empty states when no balances exist

## 10.9 Auditability

### Must support
- finalized expense snapshot
- ability to revisit review decisions
- enough stored data to explain the final result later

---

## 11. Technical direction implied by this spec

This is not a final engineering design, but the spec implies the following:

### Backend truth
- groups, expenses, items, assignments, adjustments, and balances need persistence
- backend should compute final balances
- extraction response should flow into persisted draft expense state

### Frontend role
- frontend is for editing/reviewing/confirming
- frontend should not invent financial truth independently

### OCR/AI role
- extraction should be suggestion-first
- low-confidence or weird receipts must be editable
- AI is not the product; trustworthy review is the product

### Service boundary
Current separation between core service and receipt extraction service is acceptable if kept simple.

---

## 12. Other avenues to capture without committing yet

These are worth preserving as strategic ideas, but should not be assumed to be in immediate build scope.

### Avenue A, bookkeeping/accountancy workflow
Use similar extraction + review primitives for:
- invoices
- receipts
- expense categorization
- document review queues

### Avenue B, small business finance admin workflow
Use structured extraction + validation for:
- vendor invoices
- purchase orders
- contract dates/payment schedules
- spreadsheet/accounting exports

### Avenue C, local AI workflow service
Use the same extraction/review concepts as a services business for:
- local accountancy firms
- bookkeeping firms
- admin-heavy small businesses

### Strategic note
Avenue C can create near-term revenue without deciding that Divvy Up itself must become a B2B finance product.

That separation is useful.

---

## 13. Product decisions we need to make explicitly

1. **Is Divvy Up still primarily consumer/shared-expense focused?**
2. **How far do we take invoice/document extraction inside the same product?**
3. **Do we want mobile as a real first-class implementation immediately, or should web become the honest first complete flow?**
4. **What is the canonical treatment of tax/tip/discount?**
5. **What level of editability is required before users will trust OCR output?**
6. **At what point does document intelligence become a separate B2B product rather than an extension of Divvy Up?**

---

## 14. Recommended immediate next step

Do not jump straight into broad new features.

The next spec-driven decomposition should focus on:

### Track 1, complete the truthful core product
- wire receipt review to backend data
- persist draft/finalized expenses
- make backend the balance source of truth
- align tax/tip/discount behavior
- complete group and balances flow

### Track 2, capture expansion hypothesis cleanly
- create a separate future-spec for invoice/document extraction within or adjacent to Divvy Up
- do not merge it into Phase 1 tasks by default

This keeps the product coherent while preserving the bigger opportunity.

---

## 15. Plain-English summary

Divvy Up today is a shared-expense app scaffold with strong receipt-led intent, but the main flow still needs to become real.

The right next move is:
- finish the core shared-expense flow honestly
- make the backend own the financial truth
- keep document extraction expansion as a deliberate next-phase decision

That gives us a clean base for the coding lane to turn into requirements, design, and tasks.
