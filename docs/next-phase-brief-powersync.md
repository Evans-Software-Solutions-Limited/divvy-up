# Next Phase Brief — Wire PowerSync local-first sync into the mobile app

> **For a fresh session/agent.** This is a self-contained handoff. Read it top to
> bottom; you should not need prior conversation context. When in doubt about
> PowerSync specifics, **consult current PowerSync docs** — this space moves fast
> and the exact SDK/package names below must be verified against today's docs.

---

## 1. What Divvy Up is

A **mobile-first bill-splitting app**: snap a receipt → AI extracts line items →
assign items to people (one / equal split / everyone / custom weights) → finalize
→ see who owes whom → settle up (V1 records payments; no real money movement).
Money is **always integer pence** end to end. Personal-use, low write-concurrency.

## 2. The architecture decision you're implementing

Divvy Up is **local-first**: the on-device SQLite DB is the source of truth; the UI
reads/writes locally and works offline; changes sync bidirectionally to **Supabase
Postgres** via **PowerSync** (managed sync). This was chosen after a verified
research pass — **read `docs/local-first-sqlite-sync-research.md`** for the full
rationale and the comparison that ruled out ElectricSQL (read-only writes),
cr-sqlite (not production-ready), WatermelonDB (DIY sync), etc.

Key facts from that research to respect:
- PowerSync connects **non-invasively** to Supabase Postgres (no schema changes,
  no write perms on your tables); it streams changes down to a local SQLite DB and
  queues local writes back up via an `uploadData` handler using the Supabase client.
- Conflict model is effectively **last-write-wins at the row level** — fine for this
  low-concurrency domain. Do **not** add CRDT machinery.
- PowerSync needs **native modules → an Expo dev build / CNG, NOT Expo Go.**
- Free tier covers dev/personal use.

## 3. What's already done (do not redo)

- **`packages/db`** (merged, PR #9): the **cloud source-of-truth schema** — Drizzle
  + `postgres-js` for Supabase, `getDb()` singleton (transaction-mode pooler:
  `prepare:false`, `max:1`), and a generated migration. Tables: `users`, `groups`,
  `group_members`, `group_invites`, `expenses`, `receipt_items`, `item_assignments`,
  `receipt_adjustments`, `settlements`, `activity`. **All money = integer pence;
  custom split shares = integer `share_weight`.** This is the schema PowerSync syncs
  FROM — reuse it; don't invent a new one. See `packages/db/src/schema.ts`.
- **`packages/mobile`** (merged, PR #10): the **Expo React Native shell** — copied
  from a mature Expo app, stripped to a reusable shell, re-themed to Divvy Up.
  - Expo Router: `app/(auth)/` (sign-in/up/forgot-password) + auth-gated `app/(app)/`
    with a tabs skeleton (`index` home + `you` placeholders) and `sync-blocked.tsx`.
  - Hexagonal `src/adapters/`: **auth** (Supabase), **storage** (SQLite), **netInfo**,
    **api**. Wired in `src/providers.tsx` (order: AdapterProvider → QueryClientProvider
    → ThemeProvider).
  - Tamagui theme re-themed to Divvy Up (warm-indigo dark tokens, people palette,
    Bricolage Grotesque + Hanken Grotesk fonts).
  - Gym-specific everything was stripped; **the source app's DIY sync was removed** —
    you are adding PowerSync in its place.

## 4. This phase's goal

**Wire PowerSync as the local-first data layer of `packages/mobile`, syncing against
the `packages/db` Supabase Postgres schema — buildable and typecheck-green with
placeholder env, and functional once Brad provisions the cloud pieces (§7).**

Scope this as **one PR** (call it `feat/mobile-powersync`). Do NOT port the app's
feature screens in this PR — that's the phase after (see §8). This PR delivers the
sync plumbing + a minimal proof it works (e.g. read/write one table locally).

## 5. Concrete tasks

1. **Verify current PowerSync RN/Expo setup** against live docs before installing.
   Likely packages (confirm names/versions): `@powersync/react-native`,
   `@powersync/common`, and an SQLite driver PowerSync currently recommends for RN
   (historically `@journeyapps/react-native-quick-sqlite`; PowerSync has been moving
   to `@powersync/op-sqlite` — **check which is current**). Add the Supabase connector
   deps as documented. Remember: dev build, not Expo Go — add any required config
   plugin to `app.json`.
2. **Define the PowerSync client schema** (`src/adapters/powersync/schema.ts` or
   similar): a PowerSync `Schema` mirroring the **subset of `packages/db` tables the
   client needs** (groups, group_members, expenses, receipt_items, item_assignments,
   receipt_adjustments, settlements — skip server-only tables like `group_invites`,
   `activity` unless a screen needs them). Keep column types integer for money. Import
   or re-derive from `@divvy-up/db` types where practical so the two schemas can't
   drift — at minimum add a comment cross-referencing `packages/db/src/schema.ts`.
3. **Create the PowerSync client + Supabase connector** (a new adapter, e.g.
   `src/adapters/powersync/`): 
   - `fetchCredentials()` → PowerSync endpoint + a Supabase session token from the
     existing **`SupabaseAuthAdapter`** (reuse it; don't duplicate auth).
   - `uploadData()` → drain the PowerSync upload queue to Supabase via the supabase-js
     client (insert/update/delete per CRUD op).
   - Read `EXPO_PUBLIC_POWERSYNC_URL` (already stubbed/commented in `.env.example` —
     uncomment + wire) and the existing `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY`.
4. **Integrate with the shell's `StoragePort`** (`src/domain/ports/storage.port.ts` +
   `src/adapters/storage/sqlite.adapter.ts`). The port today is `initialize()` +
   `clearAll()`. Either replace the SQLite adapter's internals with the PowerSync DB,
   or add a `PowerSyncStorageAdapter` and swap it in `src/providers.tsx`. `initialize()`
   opens/connects PowerSync; `clearAll()` (sign-out/delete) disconnects + wipes local
   data. Expose a way for future feature code to run queries/watches against the DB.
5. **Sync rules**: add the PowerSync **sync-rules YAML** (checked into the repo, e.g.
   `packages/db/powersync/sync-rules.yaml` or `docs/`) scoping each device to the
   authed user's groups (bucket by group membership). Document how to upload it to the
   PowerSync instance.
6. **Connection status**: wire `app/(app)/sync-blocked.tsx` (already in the shell) to
   real PowerSync connection/sync status if not already, so offline/blocked states show.
7. **Prove it**: a minimal local read/write against one table (even a dev-only screen
   or a test) demonstrating data persists locally and queues for upload. Don't build
   real feature UI.

## 6. Gotchas / constraints

- **Money is integer pence.** Never floats. Custom shares are integer weights.
- **`packages/db` is the schema source of truth.** The PowerSync client schema is a
  client-side mirror of a subset — keep them consistent; call out any divergence.
- **Expo dev build required** (native modules) — you can't validate on Expo Go, and
  there's no simulator/Metro in CI. Your gates are typecheck + lint + prettier + jest.
  Make everything compile and unit-test with **placeholder env** (no live creds).
- **Reuse the existing adapters** (`SupabaseAuthAdapter` for tokens, providers wiring).
  Don't re-architect the hexagonal structure.
- **Verify PowerSync package names/APIs against current docs** — do not trust names
  from memory; the SDK has churned.

## 7. Provisioning Brad needs to do (guide him; don't block compile on it)

Write these as clear steps in the PR description / a short doc. The code should
compile and unit-test WITHOUT them; they're needed for end-to-end sync:
1. Create a **Supabase project**; run the `packages/db` migration against it
   (`cd packages/db && DATABASE_URL=… bun run db:migrate`); enable logical replication
   / the `powersync` publication as PowerSync's Supabase guide requires.
2. Create a **PowerSync Cloud** instance (free tier), connect it to the Supabase
   Postgres (connection string), and upload the sync-rules YAML from task 5.
3. Fill env: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
   `EXPO_PUBLIC_POWERSYNC_URL` (in `.env` for local, and `eas.json` per profile).
4. `eas init` for a fresh EAS project (the gym project ID was removed); create a dev
   build to actually run PowerSync on device/simulator.

## 8. The phase AFTER this one (context only — not this PR)

Port the **web** screens/flows into native, reading/writing the local PowerSync DB
instead of HTTP hooks: Home (groups list, balance hero, scan CTA), GroupDetail
(members, add-member, expenses), ReceiptReview (item editor One/Split/Everyone/Custom
+ live split bar → SavedScreen), Balances (owed hero, per-debtor rows, SettleUpSheet).
The web implementations in `packages/web/src/pages/` are the reference; port the
**pure domain** (`splitPence`, `computeBalances`, pence formatting) into a shared
package consumed by both. `packages/web` is deleted only after mobile reaches parity.

## 9. Repo facts / commands

- Monorepo: **Bun** workspaces + **Turbo**. Packages: `packages/{web,db,mobile,api-utils}`,
  `microservices/{core,other-service}`.
- Gates (run from repo root): `bun run typecheck`, `bun run lint`, `bun run prettier:check`
  (fix with `prettier:write`), `bun run test:unit`. Mobile also: `cd packages/mobile &&
  bun run test:unit` (jest-expo, currently 43 suites / 393 tests, coverage thresholds 0
  for the shell). `build` for mobile is an EAS echo (no bundler in CI).
- CI = `.github/workflows/pr-checks.yml` (Detect Changes → Install → Typecheck/Lint/
  Prettier → Build → Unit Tests). Branch from `main`, open a PR, keep it green.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. PR body
  footer: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- There's an **Inspector Brad** review convention: after the PR is green, a local
  bug-review subagent sweeps the diff (see prior PRs). Expect one before merge.

## 10. Definition of done for this PR

- PowerSync client + Supabase connector + client schema + sync rules committed.
- Integrated via the existing `StoragePort` / providers; sign-out wipes local data.
- A minimal local read/write proof (dev screen or test).
- Provisioning steps documented for Brad in the PR.
- All gates green (typecheck / lint / prettier / jest) with placeholder env.
- Clear notes on anything that can only be validated after provisioning + a dev build.

---

_Pointers: research → `docs/local-first-sqlite-sync-research.md`; cloud schema →
`packages/db/src/schema.ts`; shell adapters → `packages/mobile/src/adapters/`;
providers → `packages/mobile/src/providers.tsx`; storage port →
`packages/mobile/src/domain/ports/storage.port.ts`._
