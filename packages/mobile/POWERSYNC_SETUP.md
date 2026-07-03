# PowerSync provisioning

The mobile app's PowerSync plumbing (client schema, Supabase connector,
`PowerSyncStorageAdapter`) compiles and unit-tests with placeholder env —
no live credentials needed for CI. To actually sync data end-to-end, Brad
needs to provision the following. None of this blocks the PR; it's the
"turn it on for real" checklist.

## 1. Supabase project

1. Create a Supabase project (if one doesn't exist yet for Divvy Up).
2. Run the `packages/db` migration against it:
   ```
   cd packages/db && DATABASE_URL=<supabase-connection-string> bun run db:migrate
   ```
3. Enable logical replication and create the `powersync` publication, per
   [PowerSync's Supabase guide](https://docs.powersync.com/installation/database-setup/supabase):
   ```sql
   create publication powersync for table
     groups, group_members, expenses, receipt_items,
     item_assignments, receipt_adjustments, settlements;
   ```
   (Server-only tables — `users`, `group_invites`, `activity` — are
   intentionally excluded; the PowerSync client schema doesn't sync them.)
4. Confirm Row Level Security policies exist on every published table
   restricting rows to the caller's groups (via `group_members`) — PowerSync
   enforces sync-time scoping via `sync-config.yaml`, but Postgres RLS is
   still what protects direct `supabase-js` writes from `uploadData()`.

## 2. PowerSync Cloud instance

1. Create a PowerSync Cloud instance (free tier covers dev/personal use —
   see `docs/local-first-sqlite-sync-research.md`).
2. Connect it to the Supabase Postgres instance (connection string from
   step 1).
3. Upload `packages/db/powersync/sync-config.yaml` — either via the
   PowerSync dashboard's sync rules/streams editor, or the PowerSync CLI
   deploy command. Verify the `my_*` streams appear and each shows data
   once a test user + group exist.

## 3. Fill in env

- Local dev (`packages/mobile/.env`, copied from `.env.example`):
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  - `EXPO_PUBLIC_POWERSYNC_URL` — the PowerSync Cloud instance URL from
    step 2.
- EAS (`packages/mobile/eas.json`, per build profile): the same three vars
  under each profile's `env`.

## 4. EAS project + dev build

PowerSync needs native modules (`@journeyapps/react-native-quick-sqlite`),
so it only runs in an Expo **dev build** — never Expo Go, and there's no
simulator in CI, so none of this is exercised by `bun run test:unit`.

1. `eas init` — the previous (gym) project's EAS project ID was removed;
   this creates a fresh one and fills `extra.eas.projectId` / `owner` in
   `app.json`.
2. `eas build --profile development` (or `expo run:ios` / `expo run:android`
   locally) to get a dev build with the native PowerSync/quick-sqlite
   modules compiled in.
3. Sign in on-device and confirm:
   - `app/(app)/sync-blocked.tsx` shows "Connected" once online.
   - A row written locally (see the proof test in
     `src/adapters/storage/__tests__/powersync.adapter.test.ts` for what
     the adapter does — there's no feature screen to write through yet,
     see §8 of `docs/next-phase-brief-powersync.md`) appears in Supabase
     after `uploadData()` runs, and a row inserted directly in Supabase
     appears on-device after the next sync.

## What's NOT validated by this PR's gates

- Real device sync (needs the dev build above).
- The `sync-config.yaml` streams actually returning the right rows (needs
  a live PowerSync instance + Supabase RLS to test against).
- `@journeyapps/react-native-quick-sqlite` native linking / any
  OP-SQLite alternative — only relevant once a dev build is produced.
