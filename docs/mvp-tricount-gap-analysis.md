# MVP gap analysis — Tricount parity + Divvy Up differentiators

_Research date: 2026-07-03. Sources: [tricount.com](https://tricount.com/en-us/),
[tricount feature pages](https://tricount.com/en-us/expense-tracker-features),
[help.tricount.com](https://help.tricount.com/articles/tricount-effortlessly-share-expenses-with-friends),
plus a full repo audit (branch `feat/receipt-extraction`, post receipt-extraction PR #13)._

## The parity bar: what Tricount actually is (2026)

Tricount (owned by bunq) is now **100% free — no premium tier, no ads, no
limits**. Its feature set:

1. Create a group ("tricount") and **share it via a link — participants join
   instantly, no account required**. This friction-free join is the core of
   its product magic.
2. **Add expenses manually**: amount, title, who paid, who's involved, date.
3. Flexible splits: equal, exact amounts, or custom shares per person.
4. Balances with **"who owes whom" minimised to the fewest transactions**
   (debt simplification), plus payment-request links.
5. Settle up: record reimbursements.
6. **Multi-currency** with automatic conversion into a group currency.
7. **Offline entry with automatic sync** when back online.
8. Receipt **photo attachments and OCR scanning — now free** (this used to be
   premium; it no longer differentiates a paid tier anywhere).
9. Excel/PDF export; Splitwise import.
10. bunq ecosystem integration (virtual card auto-adds purchases) — this is
    how bunq subsidises the app.

## Where Divvy Up stands (audited)

Only two things are genuinely working end-to-end today: **balance
computation + the Balances screen**, and the **largest-remainder pence-exact
split engine** (implemented identically in web and backend). Everything else
is one of: backend-on-in-memory-Maps, schema-only, or UI-prototype-only.

One structural fact dominates the whole table below: **`microservices/core`
persists to in-memory `Map`s, not Postgres** — the Drizzle schema in
`packages/db` is complete and well-designed but nothing reads or writes it.
Until that lands, every "working" feature resets on Lambda cold start.

| Tricount feature                               | Divvy Up status                                                                                                                                                  | Gap size                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Group create/list/view + add member            | Backend (in-memory) + UI wired                                                                                                                                   | Persistence only                           |
| Join via share link, no account                | **Absent** (full `group_invites` schema exists; no handler, no UI; no auth at all — JWT authorizer is a TODO)                                                    | **Large — this is Tricount's core UX**     |
| **Manual expense entry (no receipt)**          | **No UI; API almost there** — `POST /expenses` exists but requires an `items` array; `expenses.receipt_image_key` is already nullable by design                  | **Small** (see below)                      |
| Flexible splits                                | one/equal/everyone modes work through API+UI; custom weights have API+schema but **no UI editor**                                                                | Small                                      |
| Balances                                       | Working end-to-end                                                                                                                                               | —                                          |
| Debt simplification (min transfers)            | **Absent** — balances are computed but no settlement-suggestion algorithm                                                                                        | Small (greedy algorithm over net balances) |
| Settle up (record payment)                     | Schema ready; UI button updates **local state only** — no POST handler                                                                                           | Small                                      |
| Tax/tip/discount                               | Schema + types complete; `computeBalances` **explicitly skips distribution**; no handler/UI                                                                      | Medium                                     |
| Multi-currency + conversion                    | `expenses.currency` column (GBP default); no rates, no UI                                                                                                        | Defer (GBP-only V1 is fine)                |
| Offline + sync                                 | Mobile Expo shell merged (PR #10/#12 foundation); PowerSync designed but **not wired**; mobile has no feature screens                                            | Large (own phase, already planned)         |
| Receipt photo + OCR                            | **Backend real as of PR #13** (upload-url + Claude vision extraction); ReceiptReview UI is a rich prototype **not wired to the API**; `/scan` CTA routes nowhere | Medium (wiring, not building)              |
| Export / categories / stats / Splitwise import | Absent, out of V1 scope per `docs/divvy-up-product.md`                                                                                                           | Defer                                      |
| Activity feed                                  | Schema complete (enums for expense_added/settled_up/member_added); no handler/screen                                                                             | Defer or thin slice                        |
| Payment integration (bunq card)                | Out of scope — V1 records payments, never moves money                                                                                                            | Never (by design)                          |

## Manual expense entry — the specific ask

The cheapest correct model: **a manual expense is an expense with exactly one
receipt item**. `description` = expense title, `quantity` = 1, `unitPrice` =
the amount, assignment mode applied to that single item. This reuses the
entire existing split/assignment/balances machinery unchanged, and the schema
already anticipates it (`receipt_image_key` nullable, comment: "manual
expense"). Work needed:

- **API**: none structurally — `POST /expenses` already accepts this shape.
  Optionally add a convenience validation path (amount + title → synthesised
  single item) so clients don't hand-build the item.
- **UI**: an "Add expense" sheet (title, amount, payer, date, who's involved,
  split mode) on GroupDetail — the assignment controls already exist in
  ReceiptReview and can be reused.

## Divvy Up's differentiators (the "extra features")

Since Tricount's OCR is now free, "we scan receipts" is not the moat. The
declared differentiators (per `docs/divvy-up-product.md` and the built UX)
are one level deeper:

1. **Item-level assignment from the scan** — Tricount's OCR reads a total;
   Divvy Up assigns _each line item_ to people (one/equal/everyone/custom)
   with a live split bar. That's the "who had the steak" problem Tricount
   doesn't solve.
2. **Confidence-aware review** — per-item `confidence`/`flag` from extraction
   drive a "needs a check" UI so users trust the numbers.
3. **Pence-exact fairness** — largest-remainder splitting, integer money end
   to end.
4. **Local-first mobile** (PowerSync) — parity with Tricount's offline story,
   with full offline reads.

## Recommended MVP order (each ≈ one phase)

1. **Core persistence** — wire `microservices/core` to `packages/db`
   Postgres. Everything else is sandcastles until this lands. (Known debt,
   explicitly deferred so far.)
2. **Auth + invite links** — Supabase JWT authorizer (TODO in
   `infra/api.ts`) + `group_invites` handlers/UI. Restores the security
   assumptions PR #13 deferred (per-user object authorization on
   `/receipts/extract`) and delivers Tricount's join-by-link. Decide here how
   close to "no account required" to get (placeholder members + invite links
   approximate it).
3. **Expense UX slice** — manual "Add expense" sheet (above), custom-weight
   editor UI, settle-up POST handler, and a greedy min-transfer settlement
   suggestion. All small; together they complete the daily-use loop.
4. **Wire the scan flow** — `/scan` page → upload-url → PUT → extract →
   ReceiptReview on real data (backend is done; this is client wiring), plus
   tax/tip/discount distribution in `computeBalances`.
5. **Mobile + PowerSync** — the local-first phase already briefed.

Defer past MVP: multi-currency conversion, export, categories/statistics,
activity feed (unless a thin slice falls out of persistence), Splitwise
import.
