# Requirements — Data & Persistence

> Feature #2 (`data-and-persistence`), BE foundation, one shippable PR.
> Inherits `.kiro/steering/{product,tech,structure}.md`. Read those first.

## Introduction

This feature is the **data backbone** for Divvy Up. It creates `packages/db` — a Drizzle
ORM + Postgres (Supabase) package with a Lambda-singleton `getDb()` client, the **full
relational schema** for every domain entity, Drizzle CLI migration scripts, and an initial
migration. It then **rewrites the stubbed in-memory repositories** in `microservices/core`
against Drizzle (groups, expenses, members, settlements, activity), reconciles
`microservices/core/src/domain/types.ts` to match the schema, and adds repository tests
against a sandbox database.

Two product invariants drive almost every requirement:

1. **Money is integer pence everywhere.** Every monetary column is a Postgres `integer`
   storing minor units (pence). No `numeric`, no `decimal`, no float. Custom splits use
   **integer share weights** (e.g. `2 : 1`), never float fractions.
2. **All access is scoped to the authenticated user and their group memberships.** A user
   can only read or mutate groups they belong to, and expenses/items within those groups.

Auth itself (JWT verification, the API authorizer) is owned by feature #4. This feature
defines the repositories to **accept a `userId` (and `groupId` where relevant) and enforce
ownership scoping**, so that when #4 lands the authenticated subject simply flows in.

The split/balance maths are owned by feature #3 (`shared-split-engine`). This feature only
persists the inputs and outputs; it does not compute splits.

---

## Requirements

### Requirement 1 — `packages/db` package scaffold & singleton client

**User Story:** As a backend developer, I want a single `packages/db` package exposing a
pooled, Lambda-safe `getDb()` client, so that every microservice queries Postgres through
one tested connection path instead of bespoke wiring.

#### Acceptance Criteria

1. THE SYSTEM SHALL provide a `@divvy-up/db` workspace package under `packages/db` with
   `exports` for `.` (index), `./schema`, and `./client`.
2. THE SYSTEM SHALL expose `getDb()` returning a Drizzle client bound to the full schema,
   memoised in a module-level singleton so one client is reused per Lambda cold start.
3. THE SYSTEM SHALL connect using the `postgres-js` driver with `prepare: false` and
   `max: 1`, the only configuration that is safe behind Supabase's transaction-mode pooler
   (pgbouncer) under Lambda scale-out.
4. WHEN running inside SST THE SYSTEM SHALL read the connection string from the SST
   `Resource` for the database-URL secret.
5. WHEN the SST `Resource` is unavailable (local tooling, tests) THE SYSTEM SHALL fall back
   to the `DATABASE_URL` environment variable.
6. IF no connection string can be resolved from either source THEN THE SYSTEM SHALL throw a
   descriptive error naming the secret and env var rather than attempting to connect.
7. THE SYSTEM SHALL export a `createDb(url?)` factory (un-memoised) so tests can construct an
   isolated client against a sandbox database.

### Requirement 2 — Connection-string secret via `sst.Secret`

**User Story:** As an operator, I want the database connection string held as an SST secret,
so that it is injected per stage from CI and never committed to git.

#### Acceptance Criteria

1. THE SYSTEM SHALL declare the database-URL secret as an `sst.Secret` in `infra/secrets.ts`.
2. THE SYSTEM SHALL link that secret to the `core` and `other-service` Lambda functions so
   `Resource.<name>.value` resolves at runtime.
3. THE SYSTEM SHALL document that the secret is the Supabase **transaction-mode pooler** URL
   (port 6543), set per stage via `sst secret set`, never file-committed.
4. WHERE a stage has no secret set THE SYSTEM SHALL surface the missing-secret error from
   Requirement 1.6 at first query rather than at deploy time.

### Requirement 3 — Drizzle CLI scripts & initial migration

**User Story:** As a backend developer, I want Drizzle CLI scripts and a checked-in initial
migration, so that the schema is versioned and reproducibly applied to any stage's database.

#### Acceptance Criteria

1. THE SYSTEM SHALL provide a `drizzle.config.ts` pointing at the schema file and a
   `migrations/` output directory, reading the connection string from `DATABASE_URL`.
2. THE SYSTEM SHALL provide `db:generate`, `db:migrate`, `db:push`, and `db:studio` package
   scripts wrapping `drizzle-kit`.
3. WHEN `db:generate` is run against the schema THE SYSTEM SHALL emit a versioned SQL
   migration plus journal metadata under `packages/db/migrations`.
4. THE SYSTEM SHALL commit an initial migration that creates every table, enum, key,
   constraint, and index defined by the schema.
5. WHEN `db:migrate` is run against an empty database THE SYSTEM SHALL apply the initial
   migration to a fully working schema with no manual steps.

### Requirement 4 — Core schema correctness (entities, keys, enums)

**User Story:** As a developer building features on this data, I want the full schema to
model every Divvy Up entity with correct types, keys, and relationships, so that features
3–8 build on a stable foundation.

#### Acceptance Criteria

1. THE SYSTEM SHALL define a `users` table (id, email, display name, timestamps) keyed by a
   UUID that corresponds to the Supabase Auth user id.
2. THE SYSTEM SHALL define a `groups` table with `name`, `emoji`, `cover_index` (people-palette
   slot 0..7), an owner `created_by` user reference, and timestamps.
3. THE SYSTEM SHALL define a `group_members` join table linking a group to a person, with
   `colour_index` (the people-palette slot, 0..7), a `placeholder` boolean for accountless
   members, an `active` boolean for soft-delete (members referenced by expenses/assignments
   cannot be hard-deleted), and an **optional** `user_id` linking to `users`. Ownership is
   **derived** (`user_id == groups.created_by`), not a stored column.
4. THE SYSTEM SHALL define an `expenses` table with a single `payer_member_id`, a
   `status` enum (`draft` | `finalized`), `receipt_image_key`, `merchant`, a `currency`
   defaulting to `GBP`, a `description`, a `date`, and timestamps.
5. THE SYSTEM SHALL define a `receipt_items` table with `description`, `unit_price`,
   `quantity`, an `assignment_mode` enum (`one` | `equal` | `everyone` | `custom`; null =
   unassigned), a `confidence` value in the range 0..1, an optional `flag` text, and an
   optional `group_label` (e.g. "The wine round").
6. THE SYSTEM SHALL define an `item_assignments` table holding the member rows for `one`,
   `equal`, and `custom` (with an integer `share_weight` used only by `custom`). An `everyone`
   item SHALL store **no** rows — its mode on `receipt_items` resolves to the group's current
   members at finalize, so later joiners are included automatically.
7. THE SYSTEM SHALL define a `receipt_adjustments` table with a `kind` enum
   (`tax` | `tip` | `discount`), a percent-or-fixed indicator, and the amount.
8. THE SYSTEM SHALL define a `settlements` table recording mark-as-paid records (group, from
   member, to member, amount, timestamp) with **no money-movement fields**.
9. THE SYSTEM SHALL define an `activity` table for feed entries (group, actor, kind, free
   text, optional related expense/settlement, timestamp).
   9a. THE SYSTEM SHALL define a `group_invites` table (group, optional placeholder `member_id`, a
   **hashed** token with a unique index, `created_by`, `expires_at`, nullable `used_at`,
   timestamp) — consumed by `groups-and-members` (#5).
10. THE SYSTEM SHALL enumerate `expense_status`, `assignment_mode`, `adjustment_kind`, and
    `activity_kind` as Postgres enums shared across tables.
11. THE SYSTEM SHALL declare foreign keys for every relationship with delete behaviour that
    keeps the graph consistent (deleting an expense removes its items, assignments, and
    adjustments).

### Requirement 5 — Pence & weight integrity (no fractional money)

**User Story:** As a product owner, I want money and split weights stored as integers, so
that "no hidden split math" holds and per-person shares can always sum exactly to the total.

#### Acceptance Criteria

1. THE SYSTEM SHALL store every monetary column (`expenses` totals if any, `receipt_items.
unit_price`, `receipt_adjustments.amount`, `settlements.amount`, `activity.amount`) as a
   Postgres `integer` representing pence — never `numeric`, `decimal`, or floating point.
2. THE SYSTEM SHALL store `item_assignments.share_weight` as a positive `integer` (e.g.
   `2 : 1`), and SHALL NOT store a float fraction.
3. THE SYSTEM SHALL constrain `receipt_items.quantity` to a positive integer.
4. THE SYSTEM SHALL constrain `receipt_items.confidence` to a `numeric` in the inclusive
   range `0..1` (confidence is a probability, not money).
5. THE SYSTEM SHALL constrain `receipt_adjustments` so a percent adjustment stores its rate
   in basis points or hundredths as an integer, never a float, and a fixed adjustment stores
   pence; discounts are represented as negative amounts.
6. WHERE an item's `assignment_mode` (on `receipt_items`) is anything other than `custom` THE
   SYSTEM SHALL not require `share_weight` on its `item_assignments` rows (a `CHECK` ensures any
   present `share_weight` is a positive integer; the repository enforces weights iff mode is
   `custom`).

### Requirement 6 — Many-to-many join integrity

**User Story:** As a developer, I want the membership and assignment joins to be uniquely and
referentially correct, so that a person can't be double-added to a group or assigned twice to
the same item.

#### Acceptance Criteria

1. THE SYSTEM SHALL enforce a unique constraint on `group_members` per (group, member
   identity) so the same person is not added to a group twice.
2. WHERE a `group_members` row links a real account THE SYSTEM SHALL enforce that at most one
   membership per (group, user) exists.
3. THE SYSTEM SHALL enforce a unique constraint on `item_assignments` per (item, member) so a
   member cannot be assigned to the same item twice.
4. THE SYSTEM SHALL constrain `expenses.payer_member_id` and every `item_assignments.
member_id` to reference a `group_members` row belonging to the **same group** as the
   expense.
5. IF a `group_members` row is deleted THEN THE SYSTEM SHALL prevent the delete (or cascade
   consistently) so that no expense, payer, or assignment is left referencing a non-existent
   member.

### Requirement 7 — Ownership scoping in repositories

**User Story:** As a user, I want my data isolated to groups I belong to, so that I can never
see or modify another household's expenses.

#### Acceptance Criteria

1. THE SYSTEM SHALL accept a `userId` on every repository read/write that returns or mutates
   user-scoped data.
2. WHEN listing groups THE SYSTEM SHALL return only groups in which the given `userId` is a
   member (via a `group_members.user_id` link).
3. WHEN reading or mutating a group, expense, item, assignment, settlement, or activity row
   THE SYSTEM SHALL verify the `userId` is a member of the owning group before returning or
   writing.
4. IF the `userId` is not a member of the target group THEN THE SYSTEM SHALL behave as if the
   resource does not exist (return `null` / empty / a not-found result), never leaking its
   existence.
5. WHEN creating a group THE SYSTEM SHALL record the creator as `created_by` and create their
   `group_members` row in the same transaction.

### Requirement 8 — Repository behaviour (groups, expenses, members, settlements, activity)

**User Story:** As a developer, I want each entity's repository to provide the CRUD the
existing handlers and upcoming features need, so that the in-memory stubs can be swapped out
without changing handler contracts.

#### Acceptance Criteria

1. THE SYSTEM SHALL provide a `GroupsRepository` with `list(userId)`, `create(userId,
input)`, and `findById(userId, id)` that hydrates the group's members.
2. THE SYSTEM SHALL provide a `MembersRepository` with `addMember`, `listByGroup`,
   `findMembership` (resolve `userId` + `groupId` → the caller's `group_members` row, or null when
   not an active member), `linkUser` (attach an account to a placeholder), and `remove`, each
   scoped by `userId`.
3. THE SYSTEM SHALL provide an `ExpensesRepository` with `create`, `findById` (hydrating
   items, assignments, adjustments), `listByGroup`, `updateItemAssignment`, and `finalize`,
   each scoped by `userId`.
4. WHEN `ExpensesRepository.create` is called THE SYSTEM SHALL insert the expense, its
   receipt items, their assignments, and adjustments in a single transaction with `status`
   defaulting to `draft`.
5. WHEN `updateItemAssignment` is called THE SYSTEM SHALL atomically set the item's
   `assignment_mode` (on `receipt_items`) and replace its `item_assignments` member rows —
   inserting member rows (+ weights for `custom`) for `one`/`equal`/`custom`, and **no** rows for
   `everyone` (mode only) or `unassigned` (mode null, no rows).
6. THE SYSTEM SHALL provide a `SettlementsRepository` with `record(userId, input)` and
   `listByGroup(userId, groupId)` writing mark-as-paid records with no money movement.
7. THE SYSTEM SHALL provide an `ActivityRepository` with `append(userId, entry)` and
   `listByGroup(userId, groupId)` returning the most-recent-first feed.
8. THE SYSTEM SHALL preserve the existing repository `static readonly key` identifiers and
   method names that handlers already depend on, extending signatures only to add `userId`
   scoping.

### Requirement 9 — Domain-type reconciliation

**User Story:** As a developer, I want `domain/types.ts` to match the schema and the locked
product decisions, so that the type contract the handlers and clients use is accurate.

#### Acceptance Criteria

1. THE SYSTEM SHALL change `CustomShare` from a float `fraction` to an integer `weight`.
2. THE SYSTEM SHALL change the default/expected `currency` from `USD` to `GBP`.
3. THE SYSTEM SHALL extend `Member` with `colourIndex`, `placeholder`, and optional `userId`.
4. THE SYSTEM SHALL extend `Group` with `emoji` and `coverIndex`, and `Member` with `active`.
5. THE SYSTEM SHALL extend `ReceiptItem` with `confidence`, optional `flag`, and optional
   `groupLabel`.
6. THE SYSTEM SHALL prefer Drizzle schema-inferred types (`$inferSelect` / `$inferInsert`) as
   the source of truth, with `domain/types.ts` re-exporting / aligning to them rather than
   duplicating field definitions.

### Requirement 10 — Migrations & repository tests against a sandbox DB

**User Story:** As a developer, I want repository tests to run against a real Postgres
applying the real migration, so that schema correctness and scoping are verified, not assumed.

#### Acceptance Criteria

1. THE SYSTEM SHALL run repository tests against a sandbox Postgres reachable via a test
   `DATABASE_URL`, applying the committed migration before the suite.
2. THE SYSTEM SHALL reset (truncate) all tables between tests so cases are independent.
3. THE SYSTEM SHALL verify that money round-trips as integer pence with no precision loss.
4. THE SYSTEM SHALL verify that a `userId` outside a group cannot read or mutate that group's
   rows (Requirement 7.4 behaviour).
5. THE SYSTEM SHALL verify the many-to-many uniqueness constraints (Requirement 6) reject
   duplicate memberships and duplicate item assignments.
6. WHERE a sandbox `DATABASE_URL` is not configured in the environment THE SYSTEM SHALL skip
   the DB-backed tests with a clear message rather than failing the suite.
7. THE SYSTEM SHALL keep coverage at the repo's threshold for the rewritten repository code.
