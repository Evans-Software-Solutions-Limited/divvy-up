# Divvy Up — Release Readiness Plan

Target: ship a **mobile app (Expo) + backend** as a coherent, shippable product. The
React+Vite web app is **out of scope** and will be removed. Stack mirrors the
`persistence-backend-sst` reference app: **Supabase Postgres + Drizzle + Supabase Auth + S3**.

---

## 1. Current state (honest snapshot)

**Real:**

- `computeBalances` — all four split modes, payer exclusion, rounding. Well-tested.
- API handlers: expense create / finalize / item-assignment / groups-list / receipt-extract (schema-validated).
- CI/CD: PR checks, PR preview envs, staging + production deploys, release-please, OIDC.

**Stubbed / in-memory / missing:**

| Subsystem        | State                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------- |
| Database         | None. `groupsRepository` returns `[]`/`null`; `expensesRepository` is an in-memory `Map`. |
| Receipt OCR      | 100% mock (hardcoded "Bella Italia"). No Textract / Claude vision.                        |
| Object storage   | No S3 bucket; no image upload path; `receiptImageKey` never populated.                    |
| Auth             | JWT decode utils exist but enforced nowhere. API fully open. Login page is boilerplate.   |
| Mobile app       | Does not exist (product is "mobile-first").                                               |
| Tax/tip/discount | Not distributed into balances (deferred in code).                                         |

---

## 2. Decisions locked

- **Ship mobile + backend only.** Remove `packages/web`.
- **Relational data model** (Postgres + Drizzle), not DynamoDB — balances are join+aggregate
  queries and membership/assignment are many-to-many.
- **Supabase Auth** (JWKS verification on the API, Supabase session on the client) — reuses
  the reference pattern and avoids hand-rolling auth.
- **S3** for receipt images.

---

## 2.5 Design prototype — what it locks in

A Claude Design prototype exists (`~/Downloads/Divvy Up`, dark-first iOS, with a
`HANDOFF.md` that maps design → backend). It is effectively a spec, and it makes several
decisions that change the **backend**, not just the UI:

- **Money is integer pence (minor units) everywhere.** The prototype's `compute.jsx`
  (`splitPence` / `computeSplit`) is the canonical split engine — it uses **largest-remainder
  rounding** so per-person shares always sum exactly to the total. The current backend
  `computeBalances` ([computeBalances.ts:51](microservices/core/src/application/expenses/finalize/computeBalances.ts:51))
  rounds each share independently (`Math.round(itemTotal * fraction)`), which can over/under-sum.
  **Adopt the prototype's algorithm.**
- **Custom split = integer share weights** (2 : 1 steppers), not float fractions. Current
  `CustomShare.fraction: number` ([types.ts:68](microservices/core/src/domain/types.ts:68)) is
  lossy; switch to integer weights + `splitPence`.
- **Adjustments distribute pro-rata** to each person's assigned item subtotal (the deferred
  "design pass" is now decided). Percent computed on items subtotal; discounts negative.
- **Per-item AI confidence** (`conf` 0–1) + optional `flag` text drives the "N items need a
  quick check" UX and blocks finalize while anything is unassigned. The extraction API must
  **return per-item confidence**, which the current mock does not.
- **Placeholder (accountless) members** are first-class and assignable — the existing optional
  `Member.userId` already supports this.
- **New domain concepts** the prototype assumes that the backend lacks: per-member **colour**
  (8-colour palette) + initials, group **emoji/cover**, item **grouping** ("The wine round"),
  a **settle-up / mark-as-paid** record (V1 = record-keeping, no money movement), and an
  **activity feed**.
- **Currency:** prototype is GBP; backend defaults to USD ([types.ts:45](microservices/core/src/domain/types.ts:45)).
  Default to GBP for V1, keep the field.
- **Design system → Tamagui theme:** tokens in `styles/tokens.css` (warm-indigo dark theme,
  semantic money colours, 8-colour people palette, Bricolage Grotesque / Hanken Grotesk) port
  directly to Tamagui tokens. The component kit (`app/ui.jsx`: avatar, item row, assignment
  control, money, sheet, buttons) is built to lift into React Native.
- **Designed flows:** Home → Annotate coach → Camera → AI processing → Review & assign →
  Saved → Balances → Settle up. **Not yet designed** (mobile phase must still design these):
  onboarding/auth, create/manage group, manual add-expense, profile/settings.

## 3. Phased plan

Phases 1–3 are backend and can overlap once the API contract stabilises; Phase 4 (mobile)
starts as soon as the contract is stable.

### Phase 1 — Persistence foundation (`packages/db`)

_Blocker for everything; nothing persists today._

- Create `packages/db` (Drizzle + `postgres.js`, Lambda-pooler config, `getDb()` singleton).
- `schema.ts`: `users`, `groups` (+ `emoji`, `cover_colour`), `group_members` (join, +
  `colour_index`, `placeholder` flag for accountless members), `expenses`, `receipt_items`
  (+ `confidence`, `flag`, optional `group_label`), `item_assignments` (custom = **integer
  share weights**), `receipt_adjustments`, `settlements` (mark-as-paid), `activity` (feed).
- All money columns are **integer pence**.
- Connection string via `sst.Secret("DivvyUpDatabaseUrl")`; `infra/secrets.ts`.
- Drizzle CLI scripts (`db:generate`, `db:migrate`, `db:push`, `db:studio`) + initial migration.
- Rewrite `groupsRepository`, `expensesRepository`, (new) `receiptItemsRepository` against Drizzle.
- Repository-layer tests against a sandbox DB.

### Phase 2 — Auth, end to end

- `packages/api-utils`: Supabase JWT verification via JWKS (`jose`), cached per warm Lambda.
- Elysia `.derive()` middleware + `requireAuth`; attach `userId` to context.
- API Gateway authorizer wired on both `coreAPI` and `receiptServiceAPI` (`infra/api.ts`).
- Scope every query to the authenticated user / their group memberships (ownership checks).

### Phase 3 — Receipts for real

- `infra/storage.ts`: S3 bucket (CORS, linked to handlers).
- Upload path: presigned PUT (or API-proxied upload) → store `receiptImageKey`.
- Replace mock OCR with **AWS Textract or Claude vision**; map output → structured items
  **including per-item `confidence` and a `flag` reason** (drives the review "quick check" UX).
- Wire `receiptImageKey` through create → extract → review.

### Phase 4 — Mobile app (`packages/mobile`)

- Scaffold Expo + expo-router + Tamagui; auth-guarded layout groups (`(auth)` / `(app)`).
- **Port the prototype design system** (`styles/tokens.css` → Tamagui theme; `app/ui.jsx`
  component kit → RN components: people-colour avatars, item row, segmented assignment control,
  money, bottom sheet, buttons).
- Ports/adapters: eden/treaty API client with token injection; Supabase session adapter
  (AsyncStorage, refresh, AppState).
- Screens (prototype-designed): Home, Camera/scan, AI processing, Review & assign (incl.
  item-editor sheet + "needs a quick check" summary + "how AI read your receipt"), Saved,
  Balances, Settle up.
- Screens still to **design + build** (not in prototype): onboarding/auth, create/manage
  group, manual add-expense, profile/settings.
- EAS build profiles (staging/production) → TestFlight / Play internal track.
- Jest + RN Testing Library, coverage thresholds.

### Phase 5 — Finish the split logic

- Replace `computeBalances` with the prototype's **`splitPence` / `computeSplit`** semantics
  (integer pence, largest-remainder rounding, integer custom-share weights). Lift the engine
  into a shared package so backend and mobile compute identically.
- Distribute tax / tip / discount **pro-rata to assigned subtotal** (per the prototype).
- Add **settle-up / mark-as-paid** recording (no money movement) + activity feed.
- Block finalize while any item is unassigned (matches the prototype's trust model).

### Phase 6 — Harden for production

- Global structured error handler (request-ID correlation, prod-safe stack traces).
- Coverage thresholds in CI (reference uses 90%).
- Custom domains per stage (`infra/domains/`); preprod stage + workflow (see
  `next-steps-deployments.md`).
- Branch protection on `main`; secrets configured per environment.
- Basic observability (CloudWatch log conventions / alerts).

---

## 4. Cleanup

- Remove `packages/web` and its infra (`infra/web.ts`, web outputs in `sst.config.ts`,
  web jobs in CI path filters).
- Update `docs/divvy-up-product.md` "Likely Architecture" → confirmed architecture.

---

## 5. Critical path

`packages/db` → auth → (receipts ∥ mobile) → split logic → hardening → store submission.

The single longest pole is the **mobile app + store review**; start its scaffold in parallel
with Phase 3 as soon as the API contract is stable.
