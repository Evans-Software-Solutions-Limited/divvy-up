# Next Phase Brief — Group invite links (join-by-link, `group_invites`)

> **For a fresh session/agent.** Self-contained handoff — read top to bottom.
> Where this says "decide," the decision is deliberately yours; don't assume it
> from training data. Follow the standard the repo already holds itself to (see
> `docs/next-phase-brief-receipt-extraction.md` and
> `docs/next-phase-brief-powersync.md` for the format and bar).

---

## 1. What Divvy Up is

A **mobile-first bill-splitting app**: create a group → add members → snap a
receipt (AI extracts line items) → assign items to people → finalize → see who
owes whom → settle up. Money is **always integer pence** end to end, never
floats. Personal-use, low write-concurrency, low volume — do not over-engineer
for scale it will never see.

## 2. Your job this phase

Implement **join-by-link** for groups — Tricount's core UX magic and the single
highest-value feature Divvy Up still lacks. Today there is **no way for a second
real person to get into a group**: `POST /groups/:id/members` only ever creates
**placeholder** members (accountless seats, `user_id = null`). This phase makes a
group shareable via an invite link that another authenticated user can accept to
become a real, linked member.

This is a **backend slice** — build the handlers + repository, fully tested,
no provisioning required. Client wiring is out of scope (web is being retired;
mobile screens don't exist yet). A correct, well-tested backend is the complete
deliverable.

## 3. What's already decided (do not re-litigate)

- **Database stays Postgres/Supabase via Drizzle** (`packages/db`). Backend is
  AWS Lambda (SST v3) + Elysia + hexagonal ports/adapters. You implement
  _inside_ this pattern.
- **Auth is Supabase JWT**, already enforced. Every core route runs behind
  `coreAuth` (`microservices/core/src/shared/auth.ts`) which guarantees a
  verified `userId`. Use `getUserId(ctx)` to read it.
- **The `group_invites` table already exists** (`packages/db/src/schema.ts`) and
  is well-designed — build against it, don't add columns unless you find a real
  gap:
  - `tokenHash text` — **store a HASH of the token, never the raw token.** The
    raw token goes in the link you return once, at creation; only its hash is
    persisted (unique index `group_invites_token_hash_uniq`).
  - `memberId uuid null` — the **placeholder seat this invite fills**, if any.
    Null = open invite → accepting creates a **new** member row. Non-null =
    accepting **claims that placeholder seat** (link the accepting user to the
    existing placeholder member instead of creating a duplicate).
  - `expiresAt timestamptz notnull`, `usedAt timestamptz null` (null until
    accepted), `createdBy`, `groupId`.

## 4. The decisions that are genuinely yours

- **Single-use vs. reusable, and expiry window.** The schema has `usedAt` (a
  single-use signal) and `expiresAt`. Decide the policy: is an invite one-shot
  (marked used on first accept) or good for the whole group until it expires?
  Tricount's real magic is a **reusable** group link — but reusable + placeholder
  seat-claiming interact (a seat can only be claimed once). Decide and document.
- **Token generation + hashing.** Decide the token format (URL-safe, enough
  entropy) and the hash (a fast cryptographic hash is fine — these are
  high-entropy random tokens, not passwords, so a slow KDF is unnecessary; say
  so in a comment). Use Node/Bun `crypto`. Never log or persist the raw token.
- **How close to "no account required" to get.** Tricount lets people join with
  **no account at all**. Divvy Up requires a Supabase-authed user to accept.
  Placeholder members + invite links **approximate** the frictionless join
  (someone is a named seat immediately; they link their account later via the
  link). Decide whether accept requires auth (recommended for V1 — simplest,
  and `coreAuth` already guarantees it) and note the tradeoff. Do **not** try to
  build true anonymous join this phase.
- **What the accept flow returns and its idempotency/edge cases** (see §6).

## 5. Endpoints to add (shape is yours to finalize)

Roughly:

- **`POST /groups/:id/invites`** — caller must be an active member of the group
  (scope with `isActiveMember`). Optionally accepts a `memberId` (the
  placeholder seat to attach). Generates a token, stores its hash + `expiresAt`,
  returns the **raw token / join URL exactly once**. Never returns the hash.
- **`POST /invites/:token/accept`** (or `POST /groups/join` with a body token —
  your call) — the authenticated caller redeems a token: validate it exists, is
  unexpired, and (per your single-use decision) unused; then either **claim the
  placeholder seat** (`memberId` set → link `user_id`, flip `placeholder`
  false) or **create a new member** for the caller; mark `usedAt` if single-use.
  Return the group (or membership) so the client can route straight in.
- Consider **`GET /invites/:token`** (preview: group name/member count before
  accepting) — optional, nice for a join-preview screen. Decide if it's worth it.

Mount new handlers in `microservices/core/src/api.ts`. Follow the existing
handler/service/repository triad exactly (see the settlements slice just merged:
`application/groups/settlements/*` + `application/repositories/settlementsRepository.ts`
— it's the closest, freshest reference for a new scoped write + its handler,
in-memory double, and PGlite test).

## 6. Design in (don't let any of these 500 or corrupt state)

- **Invalid / expired / already-used / wrong-group token** → typed 4xx, never a
  500, and **never leak** whether a token or group exists to a non-member.
- **Double-accept / race** — two accepts of the same single-use token, or one
  user accepting a link for a group they're **already a member of** (the unique
  index `group_members_group_user_uniq` will reject a duplicate — handle it
  gracefully, ideally idempotently: return their existing membership, not a 500).
- **Placeholder seat already claimed** (memberId now has a `user_id`) → clear
  4xx.
- **Accept must be atomic** — claim-seat-or-create-member **and** mark-used in
  one transaction (see `GroupsRepository.create` for the transaction pattern).
- **Colour index** when creating a new member on accept — reuse the
  `nextColourIndex` logic already in `groupsRepository.ts` (don't duplicate the
  benign-race caveat; just follow it).

## 7. What's already done (do not redo)

- **Persistence** (#14): `GroupsRepository` / `ExpensesRepository` on Postgres
  via Drizzle, transactional, PGlite-tested against the real migration
  (`packages/db/drizzle/0000_init.sql`).
- **Auth** (#15): Supabase JWT verification + per-user ownership scoping;
  `coreAuth` + `getUserId`; `isActiveMember` /`isGroupMember` in
  `@divvy-up/api-utils/auth`.
- **Receipts** (#18/#19): real extraction, S3 upload, group + image authz.
- **Settle-up + debt simplification** (this PR, #20): `POST/GET
/groups/:id/settlements`, settlement-aware minimized `GET
/groups/:id/balances`. **The freshest, closest pattern to copy.**

## 8. Repo facts / commands

- Monorepo: **Bun** workspaces + **Turbo**. Your work is in
  `microservices/core` (+ maybe `packages/api-utils` if a helper genuinely
  belongs shared). Money stays integer pence — validated, not just typed.
- Gates (repo root): `bun run typecheck`, `bun run lint`, `bun run
prettier:check` (fix: `prettier:write`), `bun run test:unit`.
  `microservices/core` uses **vitest**. Handler/service tests use in-memory
  doubles swapped in via `microservices/core/vitest.setup.ts`; repository
  correctness is proven by PGlite `*.pg.test.ts` suites against the real
  migration (`support/pgliteDb.ts` has `createTestDb`/`seed*` helpers).
- Test seam: **mock the repository/adapter, not the HTTP layer.** Add an
  in-memory `InMemoryGroupInvitesRepository` double + register it in
  `vitest.setup.ts`, mirroring `inMemorySettlementsRepository.ts`.
- Auth mock for handler tests: `application/__tests__/support/authMock.ts`
  (`authHeaders()`, `TEST_USER_ID`, `OTHER_USER_ID`).
- Branch from `main`, open a PR, keep it green. Commit trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` (adjust to your
  session's model). PR footer:
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Inspector Brad** (local): run the `inspector-brad` subagent on the branch
  diff before raising the PR; fix every 🔴/🟠/🟡 or justify; note
  `🕵️ Inspector Brad (local): clean @ <sha>` in the PR body. Do **not** fire the
  CI `@inspector-brad` action.
- CI path filter (`.github/workflows/pr-checks.yml`, "Detect Changes") — confirm
  it triggers for your changed paths (it lists `microservices/core`); flag in the
  PR if a path you touch isn't covered.

## 9. Definition of done

- Create-invite + accept-invite handlers (+ optional preview), scoped and
  mounted, following the existing triad.
- `GroupInvitesRepository` on Drizzle; **token hashed, raw token returned once
  and never persisted or logged.**
- Single-use/reuse + expiry policy **decided and documented** (short comment or
  note is enough).
- All edge cases in §6 handled — no unhandled 500s, no existence leaks,
  double-accept is idempotent, accept is atomic.
- Real tests: unit for token/hash logic + PGlite for the repository (create,
  accept-claims-placeholder, accept-creates-new, expired, used, wrong-group,
  already-member idempotency) + handler tests via in-memory double. Gates green.
- Notes on anything only provable against a live stack.

---

_Pointers: schema → `packages/db/src/schema.ts` (`groupInvites`, `groupMembers`);
closest pattern → the settlements slice (`microservices/core/src/application/groups/settlements/*`,
`application/repositories/settlementsRepository.ts` + its PGlite/in-memory tests);
membership helpers → `@divvy-up/api-utils/auth` (`isActiveMember`); colour +
transaction patterns → `microservices/core/src/application/repositories/groupsRepository.ts`;
route mounting → `microservices/core/src/api.ts`._
