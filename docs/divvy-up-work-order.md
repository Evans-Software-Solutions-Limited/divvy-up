## Goal
Create the first meaningful scaffold for Divvy Up: a tight mobile-first shared expense app focused on receipt scanning and item-level splits.

## Inputs
- Repo: /home/ubuntu/workspace/divvy-up
- SST template already copied in
- React Native reference app: /home/ubuntu/.openclaw/workspace/persistence-mobile

## Outputs
- Initial repo scaffold adapted for Divvy Up
- Product/docs baseline committed
- Mobile app shell and backend/domain skeleton for the core entities
- Push branch and open PR if keeper changes are made

## Steps
1. Read repo guidance files first.
2. Inspect the template structure and choose the smallest coherent way to adapt it for Divvy Up.
3. Add/adjust docs describing product scope and v1 architecture.
4. Scaffold core domain shapes for groups, members, expenses, receipt items, assignments, and receipt-level adjustments.
5. Scaffold a minimal mobile app shell oriented around: groups, scan/import receipt, review receipt, balances.
6. Keep it lightweight; do not overbuild OCR or auth in this first slice.
7. Run the relevant repo checks.
8. Commit, push, open PR, comment @cursor review, and report back.

## Guardrails
- Keep scope tight around receipt + split logic.
- No fake completeness.
- No bank/payments/budgeting features.
- Prefer clear structure over deep implementation in the first slice.

## Confirm Points
- Stop and report if the template shape makes mobile integration non-trivial and needs a structural decision.
- Stop and report if the chosen first slice is becoming too large.

## Definition of Done
- Repo clearly becomes Divvy Up, not generic template
- First scaffold exists for mobile + backend domain
- Docs explain the product and first milestone
- Changes committed, pushed, and PR opened if worth keeping
