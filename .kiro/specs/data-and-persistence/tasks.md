# Tasks — Data & Persistence

> Feature #2 (`data-and-persistence`), BE foundation, one PR. Implement top-to-bottom; each
> task builds on the previous. This is the data backbone, so the order is **package scaffold +
> client + secret → schema + enums → migration → repositories (one per entity) → type
> reconciliation → repository tests**. Every task references the requirements it satisfies.

---

- [ ] **1. Scaffold the `@divvy-up/db` package**
  - Create `packages/db/` with `package.json` (`name: @divvy-up/db`, `type: module`,
    `exports` for `.`, `./schema`, `./client`), `tsconfig.json`, and `src/index.ts`
    re-exporting schema, `createDb`, `getDb`, `Db`.
  - Add deps: `drizzle-orm`, `postgres`, `sst`; dev deps: `drizzle-kit`, `@types/node`,
    `typescript`. Confirm it joins the Bun/Turbo workspace and `typecheck` runs.
  - _Requirements: 1.1_

- [ ] **2. Implement the singleton `getDb()` client**
  - Add `src/client.ts`: `createDb(url?)` over `postgres-js` with `prepare:false`, `max:1`;
    `getDatabaseUrl()` reading SST `Resource.DivvyUpDatabaseUrl.value` then falling back to
    `process.env.DATABASE_URL`, throwing a descriptive error if neither resolves; module-level
    `_db` memoised `getDb()`; export `type Db`.
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

- [ ] **3. Declare the connection-string secret and link it to the functions**
  - Create `infra/secrets.ts` exporting `databaseUrl = new sst.Secret("DivvyUpDatabaseUrl")`
    with a comment documenting the Supabase transaction-pooler URL (`:6543`), set per stage
    via `sst secret set`, never committed.
  - Update `infra/api.ts` to `link: [databaseUrl]` on both `coreAPI` and `receiptServiceAPI`
    routes; import the secret in `sst.config.ts` run() if needed.
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] **4. Define enums and the `users` + `groups` tables**
  - Add `src/schema.ts` with `expenseStatus`, `assignmentMode`, `adjustmentKind`,
    `activityKind` pgEnums.
  - Define `users` (uuid PK = Supabase auth id, unique email, **nullable** display name,
    timestamps) and `groups` (name, emoji, `cover_index` 0..7 nullable + CHECK, `created_by`
    FK → users, timestamps, creator index).
  - _Requirements: 4.1, 4.2, 4.10_

- [ ] **5. Define `group_members` with placeholder + colour + soft-delete + partial-unique account link**
  - Columns: `group_id` FK (cascade), nullable `user_id` FK (set null), `name`,
    `colour_index`, `placeholder` boolean default false, `active` boolean default true, timestamps.
  - Add the `0..7` colour CHECK, a `group_id` index, and the **partial** unique index over
    `(group_id, user_id) WHERE user_id IS NOT NULL`.
  - _Requirements: 4.3, 5.\* (colour_index integer), 6.1, 6.2_

- [ ] **6. Define `expenses` and `receipt_items`**
  - `expenses`: `group_id` FK (cascade), `payer_member_id` FK → group_members (restrict),
    description, date, `status` enum default `draft`, `receipt_image_key`, `merchant`,
    `currency` default `GBP`, `created_by`, timestamps, group index.
  - `receipt_items`: `expense_id` FK (cascade), description, `unit_price` **integer pence**,
    `quantity` integer default 1, `assignment_mode` enum (nullable; null = unassigned),
    `confidence` **`real`** (float4 → JS number; not `numeric`, which Drizzle maps to a string),
    `flag`, `group_label`, `sort_order`; CHECKs for `quantity > 0` and `confidence` in `0..1`;
    expense index.
  - _Requirements: 4.4, 4.5, 5.1, 5.3, 5.4_

- [ ] **7. Define `group_invites`, `item_assignments`, `receipt_adjustments`, `settlements`, `activity`**
  - `group_invites`: `group_id` FK (cascade), nullable `member_id` FK → group_members (set null),
    `token_hash` (text, **unique index** — store a hash, not the raw token), `created_by`,
    `expires_at`, nullable `used_at`, timestamp; group index.
  - `item_assignments` (member rows for `one`/`equal`/`custom`; `everyone` stores none — its mode
    is on `receipt_items`): `item_id` FK (cascade), `member_id` FK → group_members (restrict),
    `share_weight` **integer (custom only)**; unique `(item_id, member_id)`; the `weightRule`
    CHECK (`share_weight is null or share_weight > 0`).
  - `receipt_adjustments`: `expense_id` FK (cascade), `kind` enum, `is_percent` boolean,
    `amount` integer (bps if percent else pence; discounts negative), `label`.
  - `settlements`: group/from/to member FKs, `amount` integer pence, `recorded_by`,
    timestamp; `from <> to` CHECK; **no money-movement fields**.
  - `activity`: group FK, **required** actor member (`not null`, `restrict`), `kind` enum, `text`, optional `amount`
    pence, optional `expense_id`/`settlement_id`, timestamp; `(group_id, created_at)` index.
  - Add Drizzle `relations()` and `$inferSelect`/`$inferInsert` type exports for all tables.
  - _Requirements: 4.6, 4.7, 4.8, 4.9, 4.11, 5.1, 5.2, 5.5, 5.6, 6.3, 6.4, 6.5_

- [ ] **8. Add Drizzle CLI config + scripts and generate the initial migration**
  - Add `drizzle.config.ts` (schema path, `out: ./migrations`, postgresql dialect,
    `DATABASE_URL` creds, strict).
  - Add `db:generate`/`db:migrate`/`db:push`/`db:studio` scripts to `packages/db/package.json`.
  - Run `db:generate`; commit the emitted migration + journal under `packages/db/migrations`.
    Verify `db:migrate` against an empty DB produces the full schema (all tables, enums, keys,
    CHECKs, indexes).
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] **9. Reconcile `domain/types.ts` to the schema**
  - `CustomShare.fraction: number` → `weight: number` (integer); default `currency` USD → GBP;
    extend `Member` with `colourIndex` (0..7), `placeholder`, `active`, `userId?`; extend `Group`
    with `emoji`, `coverIndex`; extend `ReceiptItem` with `confidence?`, `flag?`, `groupLabel?`.
  - Where practical align these to `@divvy-up/db` `$inferSelect` types instead of duplicating
    field definitions. Update any compile errors this surfaces in services/handlers.
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [ ] **10. Rewrite `GroupsRepository` against Drizzle with ownership scoping**
  - Replace the in-memory stub: constructor takes optional `Db` (default `getDb()`), preserve
    `static readonly key`. Implement `list(userId)` (join through `group_members`),
    `create(userId, input)` (insert group + creator's `group_members` row in one transaction,
    set `created_by`), `findById(userId, id)` returning `null` when the user isn't a member,
    hydrating members.
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.1_

- [ ] **11. Add `MembersRepository`**
  - `listByGroup`, `addMember` (placeholder or linked account; assign next free
    `colour_index`), `linkUser` (attach account to a placeholder, flip `placeholder` false),
    `remove` — all scoped by `userId` (caller must be a member of the group). Respect the
    membership unique constraint.
  - _Requirements: 7.1, 7.3, 7.4, 8.2_

- [ ] **12. Rewrite `ExpensesRepository` against Drizzle (transactional)**
  - `create(userId, input)`: one transaction inserting expense + items + assignments +
    adjustments, `status` default `draft`; assert `payer_member_id` and all assignment
    `member_id`s belong to the expense's group. `findById(userId, id)` hydrates items,
    assignments, adjustments and returns `null` when not a member. `listByGroup(userId,
groupId)`. `updateItemAssignment(...)` replaces the item's assignment rows atomically.
    `finalize(...)` flips status, scoped. Preserve `static readonly key` and method names.
  - _Requirements: 6.4, 7.1, 7.3, 7.4, 8.3, 8.4, 8.5, 8.8_

- [ ] **13. Add `SettlementsRepository` and `ActivityRepository`**
  - `SettlementsRepository.record` (mark-as-paid only, no money movement; `from <> to`) and
    `listByGroup`, scoped by `userId`.
  - `ActivityRepository.append` and `listByGroup` (most-recent-first, `limit`), scoped by
    `userId`.
  - _Requirements: 7.1, 7.3, 7.4, 8.6, 8.7_

- [ ] **14. Wire repositories into the Elysia DI and update services/handlers**
  - Update the `.decorate(...)` service modules so each repository (incl. the new
    members/settlements/activity ones) is injected; thread `userId` through services/handlers
    (sourced from the request context — a stub/`x-user-id` until feature #4's authorizer
    lands). Keep handlers thin.
  - _Requirements: 7.1, 8.8_

- [ ] **15. Repository tests against a sandbox DB**
  - Add a Vitest global setup that, when a test `DATABASE_URL` is present, applies the
    migration and exposes `createDb(testUrl)`; truncate all tables in `beforeEach`; `skip`
    DB-backed blocks with a clear message when no `DATABASE_URL`.
  - Cover: pence round-trip integrity; integer custom weights + `weightRule` CHECK; confidence
    range; ownership scoping (outsider gets null/empty, cannot mutate); membership uniqueness
    (dup account rejected, dup placeholder allowed); item-assignment uniqueness; transactional
    create rolls back fully on constraint violation; `finalize` draft→finalized scoped;
    activity ordering + limit. Keep coverage at the repo threshold.
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_
