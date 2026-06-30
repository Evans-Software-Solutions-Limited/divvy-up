# Technical Steering — Divvy Up

> Shared technical context for all specs. The stack mirrors the mature reference app
> `persistence-backend-sst` unless noted.

## Stack

| Layer           | Choice                                                            |
| --------------- | ----------------------------------------------------------------- |
| Monorepo        | Bun workspaces + Turbo (`turbo.json`)                             |
| Backend runtime | SST v3 on AWS; Elysia handlers on Lambda behind API Gateway v2    |
| Database        | **Postgres (Supabase) + Drizzle ORM** in `packages/db`            |
| Auth            | **Supabase Auth**; JWT verified on the API via JWKS (`jose`)      |
| Object storage  | **S3** (SST `sst.aws.Bucket`) for receipt images                  |
| AI extraction   | AWS Textract **or** Claude vision → structured items + confidence |
| Mobile          | **Expo + expo-router + Tamagui**; EAS build → TestFlight / Play   |
| API client      | Eden/treaty typed client against the Elysia app                   |
| Mobile state    | TanStack Query for server state; Supabase session in AsyncStorage |
| Testing         | Vitest (backend/shared), Jest + RN Testing Library (mobile)       |

## Locked technical decisions

- **Money is integer pence (minor units) everywhere** — DB columns, API payloads, compute.
  Display formats to `£x.xx`; never store fractional pence.
- **Canonical split engine** lives in a shared package (`shared-split-engine` spec). It ports
  the prototype's `splitPence` / `computeSplit` (`~/Downloads/Divvy Up/app/compute.jsx`):
  - largest-remainder rounding so per-person shares **sum exactly** to the total;
  - **custom splits use integer share weights** (e.g. 2 : 1), not float fractions;
  - **adjustments distribute pro-rata** to each person's assigned subtotal; percent computed
    on the items subtotal; discounts are negative.
  - Both backend (finalize) and mobile (live preview) import this one engine.
- **Per-item AI confidence + flag reason** are part of the extraction API contract.
- **All queries are scoped to the authenticated user** and their group memberships.
- **Design tokens** (`~/Downloads/Divvy Up/styles/tokens.css`) become the Tamagui theme:
  warm-indigo dark-first palette, semantic money colours (`--pos` / `--neg`), an 8-colour
  people palette (`--p1…--p8`), Bricolage Grotesque (display) + Hanken Grotesk (body).

## Existing code to reconcile (not greenfield)

- `microservices/core` — real handlers (expense create/finalize/item-assignment, groups list)
  with **stubbed/in-memory repositories**. Rewrite repositories against `packages/db`.
- `microservices/other-service` — receipt extract handler with **mock OCR**. Replace with real
  extraction returning confidence.
- `microservices/core/src/application/expenses/finalize/computeBalances.ts` — **replace** with
  the shared split engine (its independent per-share `Math.round` can mis-sum).
- `microservices/core/src/domain/types.ts` — already pence-based; migrate `CustomShare.fraction`
  (float) → integer weights; default currency USD → **GBP**.
- `packages/api-utils/src/jwt` — decode-only utilities; auth spec adds real **verification**.
- `packages/web` — **delete** (and its `infra/web.ts`, web outputs in `sst.config.ts`, web CI
  path filters).

## Spec-driven workflow (Kiro style)

Every feature gets a folder `.kiro/specs/<feature>/` with three files, authored and approved
in order:

1. **`requirements.md`** — Introduction + numbered Requirements. Each Requirement has a
   **User Story** (`As a <role>, I want <feature>, so that <benefit>`) and numbered
   **Acceptance Criteria in EARS notation**:
   - `WHEN <trigger> THE SYSTEM SHALL <response>` (event-driven)
   - `WHILE <state> THE SYSTEM SHALL <response>` (state-driven)
   - `IF <condition> THEN THE SYSTEM SHALL <response>` (unwanted/error)
   - `WHERE <feature/context> THE SYSTEM SHALL <response>` (optional/conditional)
   - `THE SYSTEM SHALL <requirement>` (ubiquitous)
2. **`design.md`** — sections: Overview, Architecture, Components & Interfaces, Data Models,
   API Contract, Error Handling, Testing Strategy. Include the API/type contract concretely
   (it's the FE↔BE bridge — see workflow below). Use Mermaid for flows where it helps.
3. **`tasks.md`** — a numbered checklist of incremental coding tasks. Each task references the
   requirements it satisfies (`_Requirements: 1.2, 3.1_`). Tasks must be ordered
   **frontend-first** (see below) and each builds on the previous. No task is "write a doc";
   every task is code/test.

## Delivery model: frontend-first, one PR per feature

- Each feature spec is **one shippable PR** for the app.
- Within a feature, tasks are ordered **frontend first, then backend, then wire-up**:
  1. Define the **API/type contract** (the shared bridge) up front in `design.md`.
  2. Build the **mobile UI** against that contract using a typed mock/stub of the client.
  3. Implement the **backend** (repositories, handlers, infra) to fulfill the contract.
  4. **Wire** the real client to the UI, remove the mock, add integration tests.
- A feature PR is **done** when: the mobile screens work end-to-end against the real backend,
  tests pass at the repo's coverage bar, typecheck/lint/prettier pass, and CI is green.

## Quality gates (per the reference app)

- Vitest + v8 coverage with thresholds (reference uses 90%); mobile Jest with thresholds.
- Global structured error handler (request-id correlation, prod-safe stack traces).
- Secrets via `sst.Secret`, injected per stage from CI; never in git. Canonical secret names:
  `DivvyUpDatabaseUrl` (Postgres connection string); Supabase auth config follows the same prefix.
