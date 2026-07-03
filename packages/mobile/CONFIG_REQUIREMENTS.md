# Divvy Up Mobile — Configuration Requirements

What needs to be provisioned/confirmed before the mobile app is fully
functional. This package was created by copying and stripping an existing Expo
app (`persistence-mobile`) down to a reusable **shell** and re-theming it to
Divvy Up. Sync (PowerSync) and the backend are wired in later phases.

---

## App Identity — placeholders, to confirm before publishing

| Setting         | Current value     | Action                                          |
| --------------- | ----------------- | ----------------------------------------------- |
| App name        | `Divvy Up`        | confirm                                         |
| iOS Bundle ID   | `com.divvyup.app` | **confirm/change** before first App Store push  |
| Android Package | `com.divvyup.app` | **confirm/change** before first Play Store push |
| URL Scheme      | `divvyup`         | confirm                                         |
| Expo Slug       | `divvy-up`        | confirm                                         |
| Expo Project ID | _(none)_          | **create** via `eas init` (gym project removed) |
| Expo Owner      | _(none)_          | set on `eas init`                               |
| App Version     | `0.1.0`           | —                                               |

---

## Environment Variables (`.env`, see `.env.example`)

| Variable                        | Purpose                     | Status                                   |
| ------------------------------- | --------------------------- | ---------------------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`      | Supabase project URL (auth) | **provision** (create Supabase proj)     |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (auth)    | **provision**                            |
| `EXPO_PUBLIC_API_URL`           | SST core API base URL       | from `sst dev` / deployed stage          |
| `EXPO_PUBLIC_POWERSYNC_URL`     | PowerSync instance URL      | **provision** — see `POWERSYNC_SETUP.md` |

---

## What was stripped from the source app (and would need re-adding if ever wanted)

- **Payments (Stripe / Apple Pay)** — deps, plugins, entitlements, merchant ID all removed.
- **HealthKit / Health Connect** — entitlements, permissions, deps removed.
- **In-app purchases (RevenueCat)** — dep removed.
- **All fitness domain** — exercises, workouts, sessions, nutrition, coach/clients, and their screens/presenters/containers.
- **The gym app's DIY sync** — its custom sqlite/api sync command was gym-coupled; Divvy Up will use **PowerSync** instead (see `docs/local-first-sqlite-sync-research.md`).

## What the shell retains

- Expo Router with an auth gate + tabs skeleton (home + you placeholders).
- Supabase auth adapter, SQLite storage adapter, NetInfo adapter, API adapter (hexagonal `src/adapters`).
- Tamagui theme system, **re-themed to Divvy Up** (warm-indigo dark tokens, Bricolage Grotesque + Hanken Grotesk fonts, people palette).
- Generic foundation UI components + `shared/` utils/errors/types.

---

## Next steps (later phases)

1. `eas init` to create a fresh Expo/EAS project; add `extra.eas.projectId` + `owner` back to `app.json`.
2. Create the Supabase project; fill the env vars. Provisioning PowerSync itself is now
   documented in `POWERSYNC_SETUP.md`.
3. Port the web screens/flows into native (Home, GroupDetail, ReceiptReview, Balances) — see the port inventory in the project memory.
