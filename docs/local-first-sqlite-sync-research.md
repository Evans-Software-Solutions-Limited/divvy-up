# Local-First SQLite Sync for Expo + Supabase — Research Report (mid-2026)

> **Purpose.** A comprehensive, vendor-neutral survey of the options for building a
> **local-first** mobile app where an **on-device SQLite database is the source of
> truth for reads and writes**, and changes **sync bidirectionally to a Postgres
> (Supabase) backend**. Written for an Expo / React Native stack.
>
> **Origin.** Produced for the _Divvy Up_ bill-splitting app, but the analysis is
> generic. It is shared here so it can be used to sense-check **any** Expo + Supabase
> app considering local-first / offline sync (e.g. a gym / workout-tracking app).
>
> **Method.** Multi-source web research with adversarial verification: 5 search
> angles → 21 sources fetched → 87 candidate claims → 25 verified by 3-vote
> adversarial check (need 2/3 to refute a claim to kill it); 25/25 survived. Sources
> are primary vendor docs + GitHub + independent comparisons. All facts are current
> as of **mid-2026** and this space moves fast — re-verify pricing/SDK status before
> committing.

---

## TL;DR recommendation

For an **Expo + Supabase Postgres** app with **low write-concurrency** (a handful of
users occasionally editing shared data), the recommendation is:

> **PowerSync.** It is the only option surveyed that provides **fully managed,
> bidirectional sync** between **on-device SQLite** and **Supabase Postgres**, with
> **first-class, officially-supported Expo/React Native SDKs**, a documented Supabase
> integration, and a **free tier** that covers personal/early use.

**CRDT (cr-sqlite) is overkill** for low-concurrency apps — a few users rarely
generate truly concurrent conflicting writes on the same row, so PowerSync's simpler
queue-based upload (effectively last-write-wins at the row/API level) is sufficient,
and cr-sqlite is not fully production-ready anyway.

The main trade-off with PowerSync is **vendor dependency**, mitigated by its
**self-hostable Open Edition** (Fair Source License, converts to Apache 2.0).

---

## What "local-first" actually requires

To qualify as local-first (not merely "offline cache"), a stack must:

1. **Store data on-device** in a real embedded database (SQLite), not just an
   in-memory or key-value cache.
2. **Serve reads locally** — the UI queries the local DB, so it works fully offline
   and renders instantly.
3. **Accept writes locally** — the user can create/edit while offline; writes persist
   locally and are queued.
4. **Sync bidirectionally** — local writes propagate up to the server (Postgres), and
   server changes stream down to every device.
5. **Resolve conflicts** — define what happens when two devices edit the same row.

The hard, error-prone part is **#4 and #5**. Hand-rolling the sync transport (ordering,
retries, partial failures, clock skew, delete tombstones, resumable streams) is where
most local-first projects fail. The central question is therefore: **who manages the
sync engine for you?**

---

## Comparison matrix

| Tool                                           | Works with Expo?                                             | On-device SQLite?                | Bidirectional → Postgres/Supabase?                                                 | Conflict model                                                                         | Managed / self-host / DIY                          | Verdict for low-concurrency Expo+Supabase |
| ---------------------------------------------- | ------------------------------------------------------------ | -------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------- |
| **PowerSync**                                  | ✅ Yes (dev build / CNG + EAS Build; **not** Expo Go)        | ✅ Yes                           | ✅ Yes, managed (streams down; FIFO upload queue up via your `uploadData` handler) | Queue-based upload; effectively LWW at row level, customizable in backend/`uploadData` | **Managed** cloud + **self-hostable** Open Edition | ✅ **Recommended**                        |
| **ElectricSQL**                                | ✅ Reads only (TS client / `useShape`)                       | ❌ No (PGlite doesn't run in RN) | ❌ **Read-path only** — you hand-roll writes                                       | LWW on read-sync; writes are your own API                                              | Managed read-sync; writes DIY                      | ❌ Not local-first for writes             |
| **cr-sqlite / vlcn**                           | ⚠️ Library, RN support uncertain                             | ✅ Yes                           | ❌ You build the transport                                                         | **CRDT** (conflict-free merge)                                                         | **Library only** (DIY transport)                   | ❌ Not production-ready; overkill         |
| **WatermelonDB**                               | ✅ Yes (RN-first)                                            | ✅ Yes                           | ⚠️ Protocol only — **you build push/pull endpoints**                               | You implement (typically LWW)                                                          | Library + DIY backend sync                         | ⚠️ Viable but DIY sync                    |
| **Zero (Rocicorp)**                            | ❌ React-only, no RN (as of 2026)                            | (query-based, not SQLite-file)   | —                                                                                  | —                                                                                      | Managed-ish                                        | ❌ No RN; **no offline writes**           |
| **Turso (embedded replicas / offline writes)** | ⚠️ RN bindings need New Arch; **Expo plugin only "planned"** | ✅ Yes (libSQL)                  | ✅ to **Turso cloud**, not Supabase                                                | Server-authoritative                                                                   | Managed (Turso)                                    | ❌ Not Expo-ready; wrong backend          |
| **InstantDB / Triplit / Jazz / LiveStore**     | Varies                                                       | Varies                           | Own backend, **not Postgres/Supabase**                                             | Varies (some CRDT)                                                                     | Managed / library                                  | ❌ Off-stack (not Supabase-Postgres)      |

Legend: ✅ yes · ⚠️ partial/caveated · ❌ no.

---

## Detailed findings

### 1. PowerSync — **Recommended** · confidence: high

- **What it is.** A managed sync layer that keeps an **embedded on-device SQLite DB**
  on each client in sync with **Supabase Postgres**. The app reads and writes locally;
  client writes persist to the local SQLite DB **and** to a **FIFO upload queue**
  processed via the Supabase client library (an `uploadData` handler) when connectivity
  returns. Server-side changes stream down via Postgres logical replication / WAL and
  configurable **sync rules** (which define the per-user subset of data each device gets).
- **Expo / RN.** Officially supported. PowerSync lists **Flutter, React Native, Web,
  Kotlin, Swift** SDKs; there's an official _React Native & Expo_ docs page, and a
  community demo (`powersync-react-native-expo-background-sync`) shows **background sync
  with Expo + Supabase**, including an **EAS Build** config. Caveat: PowerSync ships
  **native modules**, so it needs a **dev build / Continuous Native Generation (CNG)** —
  **it does not run in Expo Go**. (Normal for any serious Expo app.)
- **Supabase integration.** Documented, first-class. Connects **non-invasively** to
  Supabase Postgres (no schema changes, no write perms on your tables required); writes
  land back in Postgres through your Data API / upload queue, **subject to RLS**.
- **Conflict resolution.** Queue-based upload; in practice **last-write-wins at the
  row/API level**, and you can implement custom conflict logic in your backend /
  `uploadData` handler. (The docs describe the queue mechanism; the _exact_ configurable
  semantics were not pinned by a dedicated verified claim — see Open Questions.)
- **Managed vs self-host.** Both. **PowerSync Cloud** (managed) and a **self-hosting**
  option via Docker/CLI. The **Open Edition** is Fair Source (converts to Apache 2.0);
  there's also an Enterprise Self-Hosted edition. (Self-hosting loses the PowerSync
  Dashboard.)
- **Pricing (as of the Oct 31 2025 change).**
  - **Free: $0/mo** — up to **2 GB synced/mo**, **500 MB hosted**, **50 peak concurrent
    connections**. _Free projects deactivate after 1 week of inactivity._
  - **Pro: from $49/mo** — **30 GB synced/mo** included, then **$1/GB**; no deactivation.
- **Maturity.** Production-grade; multi-platform SDKs; active docs and community demos.

### 2. ElectricSQL — read-path only now · confidence: high

- **The pivot.** Electric **repositioned** (post-2024 rewrite) into a **read-path sync
  engine**. Its own docs state: _"Electric is a sync-engine. It syncs subsets of data
  from Postgres, in real-time, into local apps and services"_ and _"Electric does not
  do write-path sync. It doesn't provide (or prescribe) a built-in solution for getting
  data back into Postgres."_
- **What you get.** Real-time sync of normalized **"Shapes"** (subsets of Postgres) into
  clients via the TypeScript client / `useShape` hook. **Reads only.**
- **Writes.** **You hand-roll them** through your own backend API. Electric documents
  four DIY patterns (online writes, optimistic state, shared persistent optimistic
  state, through-the-database). As of **TanStack DB 0.6 (Mar 2026)** you can get
  on-device **SQLite persistence** for RN/Expo (via `op-sqlite` / `expo-sqlite`) with
  optimistic mutations calling **your** API — but this is a **DIY assembly**, not managed
  bidirectional sync.
- **Expo / RN.** The TS client works with Expo for **read-only Shape sync**. Its embedded
  Postgres, **PGlite, does not run in React Native** (open issue since May 2024, still
  unresolved) — so there is no on-device Postgres store in the Expo integration.
- **Verdict.** Excellent for "sync Postgres → app for fast reads," but **not** a
  local-first _write_ solution out of the box. If chosen, budget for building and
  owning the entire write path.

### 3. cr-sqlite / vlcn (CRDT SQLite) — overkill + not production-ready · confidence: medium/high

- **What it is.** A loadable **SQLite extension** adding **CRDT** (Conflict-free
  Replicated Data Type) multi-writer replication — conflict-free merges at the
  row/column level, usable from any SQLite binding.
- **Status.** The project's own README flags it as **not fully production-ready** (some
  CRDT types, e.g. counters/rich-text, incomplete), and maintenance cadence has been
  uncertain.
- **Transport.** It gives you **merge semantics, not a managed sync service** — you
  still build/operate the sync transport yourself. That's the exact flakiness risk
  local-first teams want to avoid.
- **When it's warranted.** High-concurrency **collaborative editing** (multiple users
  editing the same records simultaneously, à la Figma/Notion). For low-concurrency apps
  it buys correctness you don't need while adding an immature dependency **and** DIY
  transport.

### 4. WatermelonDB — viable but DIY sync · confidence: medium

- RN-first, SQLite-backed local database, battle-tested in React Native. Provides a
  **sync protocol** but **you implement the pull/push endpoints and conflict logic** on
  your server. Good if you want a mature local DB and are willing to own the sync
  backend against Supabase; more work than PowerSync's managed path.

### 5. Newer / adjacent entrants

- **Zero (Rocicorp).** Stable 1.0 (June 2026), strong query-sync — but **React-only (no
  React Native)** as of 2026, and **does not support offline writes** (writes are
  rejected while disconnected). Disqualified for an offline-first mobile app.
- **Turso (embedded replicas / offline writes).** Local **libSQL** replica syncing to
  **Turso cloud** (server-authoritative). Official RN bindings exist but require **RN
  0.76+ New Architecture**, and **Expo support is only a _planned_ Expo plugin**. Also
  it's a **different backend** (Turso, not Supabase Postgres).
- **InstantDB / Triplit / Jazz / LiveStore.** Each is an interesting local-first stack,
  but they bring **their own backend/sync** rather than syncing to **Supabase Postgres**
  — off-stack for a Supabase-centric app. (These were not covered by verified claims in
  this research pass; treat as "needs its own investigation" if the backend constraint
  is relaxed.)

---

## Decision framework (apply this to the gym app)

Ask these in order:

1. **Is the backend Supabase Postgres, and do you want to keep it?**
   - Yes → PowerSync or ElectricSQL are the Postgres-native choices. Turso/Instant/etc.
     would mean changing backends.
2. **Do you need offline _writes_ (create/edit while disconnected)?**
   - Yes → **PowerSync** (managed) or WatermelonDB (DIY sync). ElectricSQL alone is
     read-only; Zero rejects offline writes.
   - No (offline reads are enough) → ElectricSQL read-sync is lighter, or even TanStack
     Query persistence without a full local DB.
3. **What's the real write-concurrency?** Do multiple users edit the _same row_ at the
   _same time_, often?
   - Rarely / never → **LWW is fine → PowerSync.**
   - Frequently, with fine-grained merges required → consider CRDT (cr-sqlite), and
     accept its immaturity + DIY transport, or a CRDT-native stack.
4. **Managed vs self-host / cost sensitivity?**
   - Want minimal ops → PowerSync Cloud (free tier to start).
   - Must self-host / avoid vendor lock-in → PowerSync Open Edition (Apache-2.0-bound)
     or WatermelonDB DIY.
5. **Expo Go requirement?** Any native-module solution (PowerSync, WatermelonDB,
   op-sqlite, Turso) needs a **dev build / EAS**, not Expo Go. Budget for that.

**For a gym / workout-tracking app specifically:** the write pattern is almost always
**single-user, single-device authoring** (you log your own sets/workouts), occasionally
synced across your own devices, with **shared/collab data rare** (a PT viewing a
client's plan). That's an **even lower-concurrency profile than bill-splitting** — so
the same conclusion holds _more_ strongly: **PowerSync (LWW) is ample; CRDT is
unnecessary.** The interesting wrinkle for a gym app is **large historical datasets**
(years of sessions) — check PowerSync **sync rules** to scope each device to a relevant
window (e.g. recent + summaries) so you don't sync the entire history to every device,
and watch the **2 GB/mo free-tier sync allowance** against workout-history volume.

---

## Caveats & open questions

- **Time-sensitive.** Pricing and SDK/support facts are mid-2026 and change frequently
  (PowerSync repriced Oct 2025; ElectricSQL rewrote its architecture in 2024, shipped
  1.1 Aug 2025). **Re-verify before committing.**
- **Uneven coverage.** The verified-claim set is heavy on PowerSync and ElectricSQL.
  There is **little/no independently verified evidence** here on cr-sqlite/vlcn,
  WatermelonDB, Zero, Turso, InstantDB, Triplit, Jazz, or LiveStore — statements about
  them are lower-confidence and should be re-checked if they become candidates.
- **Vendor-primary sources.** Most citations are vendor docs — authoritative for
  capability/pricing facts, but not neutral for "who is best." The comparative verdict
  is a reasoned synthesis, not a benchmark.
- **Open questions worth pinning before build:**
  1. PowerSync's **exact** conflict-resolution model for same-row concurrent edits — is
     it strictly LWW, or fully customizable via `uploadData` + RLS?
  2. cr-sqlite/vlcn current **maintenance status** and real RN/Expo support.
  3. For a gym app with large history: PowerSync **sync-rule** patterns to bound
     per-device data, and the resulting **free-tier sync-volume** headroom.

---

## Key sources

**PowerSync**

- https://docs.powersync.com/integration-guides/supabase-+-powersync
- https://docs.powersync.com/integration-guides/supabase
- https://docs.powersync.com/client-sdks/reference/react-native-and-expo
- https://github.com/powersync-ja/powersync-js
- https://github.com/powersync-community/powersync-react-native-expo-background-sync
- https://www.powersync.com/pricing
- https://www.powersync.com/blog/simplified-cloud-pricing-based-on-data-synced
- https://docs.powersync.com/intro/self-hosting

**ElectricSQL**

- https://electric-sql.com/docs/reference/alternatives
- https://electric-sql.com/docs/guides/writes
- https://electric-sql.com/docs/integrations/expo
- https://electric-sql.com/blog/2026/03/25/tanstack-db-0.6-app-ready-with-persistence-and-includes
- https://github.com/electric-sql/pglite/issues/87

**CRDT / others**

- https://github.com/vlcn-io/cr-sqlite
- https://zero.rocicorp.dev/docs/offline
- https://turso.tech/blog/react-native-bindings-for-turso

---

_Report compiled mid-2026 from an adversarially-verified deep-research pass (25/25
claims confirmed). Re-verify time-sensitive facts before relying on them._
