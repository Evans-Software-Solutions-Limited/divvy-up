# Divvy Up

A lightweight mobile-first shared expense app for small groups, trips, and household costs — with receipt scanning and item-level split assignment as the core differentiator.

## What it does

1. Create a group and invite members.
2. Photograph or upload a receipt.
3. Review the extracted line items (OCR/vision).
4. Assign each item: one person, split equally, everyone, or custom shares.
5. Add receipt-level adjustments: tax, tip, discount.
6. See clear balances showing who owes what.

## First Milestone Scope

- Group creation and member management
- Expense creation with payer
- Receipt image upload/capture
- OCR/vision extraction into structured receipt items
- Item-level assignment (one person / equal split / everyone / custom)
- Receipt-level adjustments (tax, tip, discount)
- Group balance summary

**Out of scope for V1**: bank integrations, direct money movement, budgeting dashboards, multi-currency settlement, full offline sync, social feed/chat.

## Architecture

- **Mobile**: Expo / React Native (primary surface)
- **Web**: React + Vite (companion / admin)
- **Backend**: Elysia on AWS Lambda via SST v3
- **Database**: Postgres (via RDS or Neon)
- **Storage**: S3 for receipt images
- **OCR path**: Lambda calling a vision API, returning structured JSON

## Repo Structure

```
microservices/
  core/            # Groups, members, expenses, receipt items, assignments
  receipt-service/ # OCR/vision extraction path (scaffold)
packages/
  web/             # React + Vite web companion
  api-utils/       # Shared JWT, env, logger utilities
infra/             # SST infrastructure definitions
docs/              # Product docs and work orders
```

## Getting Started

```bash
bun install
bun run dev        # starts SST dev + web dev server
bun run test       # unit tests via Vitest/Turbo
bun run typecheck  # TypeScript check
bun run lint       # ESLint
bun run prettier:check  # Prettier
```

> **Note:** Use `bun run test` (not `bun test`). Tests use Vitest; `bun test` runs Bun's built-in runner and will fail.

## Docs

- [Product overview](docs/divvy-up-product.md)
- [Work order](docs/divvy-up-work-order.md)
- [Deployment guide](docs/next-steps-deployments.md)
