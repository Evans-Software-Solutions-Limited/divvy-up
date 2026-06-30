# Product Steering — Divvy Up

> Steering docs are shared context. Every spec under `.kiro/specs/` inherits these.
> Source of truth: `docs/divvy-up-product.md`, `docs/release-readiness-plan.md`, and the
> Claude Design prototype (`~/Downloads/Divvy Up`, see its `HANDOFF.md`).

## What we are building

Divvy Up is a **mobile-first** shared-expense app for small groups, trips, and households.
The differentiator is **receipt scanning + item-level split assignment**: photograph a receipt,
an AI extracts the line items, the user assigns each item to people, and the app computes who
owes whom — with no hidden math.

**Release target:** a shippable **mobile app (Expo/React Native) + backend**. There is **no web
app** in scope (the scaffolded `packages/web` will be removed).

## V1 scope

In: group + member management (incl. accountless placeholder members), receipt capture, AI
extraction, item assignment (one / equal / everyone / custom), receipt adjustments
(tax / tip / discount), balances, and settle-up as **record-keeping only**.

Out: bank integrations, real money movement, budgeting/analytics, multi-currency settlement,
full offline sync, social feed/chat.

## Product principles (the north star)

- **AI suggests, the user confirms.** AI never finalizes alone. Low-confidence items are
  flagged; finalize is blocked while any item is unassigned.
- **No hidden split math** — every share is explainable and visible.
- **Editing a receipt must be fast.**
- **Mobile-first, lightweight, personal-use focused.**

## Locked product decisions (from the design prototype HANDOFF)

- **Accountless members** are first-class: assign to a named placeholder, invite later.
- **Adjustment apportionment is pro-rata** to each person's assigned item subtotal, shown
  transparently.
- **AI confidence is surfaced**: a per-item amber "check this" flag _and_ a top-of-list
  "N items need a quick check" summary.
- **Settle-up is record-keeping only** (mark-as-paid); no money movement in V1.
- **Currency is GBP** for V1 (keep a currency field for the future).

## Designed vs not-yet-designed

Prototype covers the hero flow: Home → Annotate coach → Camera → AI processing → Review &
assign → Saved → Balances → Settle up.

Not yet designed (the relevant spec owns designing these): **onboarding/auth, create/manage
group, manual add-expense, profile/settings**.
