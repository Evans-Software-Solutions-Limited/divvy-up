# Tasks — Mobile App Foundation

Incremental, frontend-first coding tasks. Each builds on the previous and ends with the
requirements it satisfies. Order: scaffold Expo + router → theme/tokens → component kit →
client adapter + query provider → remove web → tests.

- [ ] 1. Scaffold the `@divvy-up/mobile` Expo + expo-router package
  - [ ] 1.1 Create `packages/mobile` with `package.json` (`@divvy-up/mobile`), Expo managed
        workflow, `expo-router`, React Native deps, and `tsconfig.json`; confirm it is picked up
        by the root `workspaces` globs.
    - _Requirements: 1.1, 1.2_
  - [ ] 1.2 Add `app.json`, `babel.config.js` (expo preset + Tamagui babel plugin placeholder),
        `metro.config.js`, and `jest.config.js` (`jest-expo`); add `dev`, `typecheck`, `lint`,
        `test`/`test:unit` scripts that conform to `turbo.json`.
    - _Requirements: 1.3, 1.4, 1.5, 1.6_
  - [ ] 1.3 Create the expo-router tree: `app/_layout.tsx` (empty provider stub + `<Slot/>`),
        `app/(auth)/_layout.tsx` + placeholder welcome screen, `app/(app)/_layout.tsx` `Tabs`
        with placeholder Home/Groups/Activity/Profile screens; boot into a visible default route
        with no guard/redirect logic.
    - _Requirements: 2.1, 2.3, 2.4, 2.6_

- [ ] 2. Build the Tamagui theme from the prototype design tokens
  - [ ] 2.1 Create `src/theme/tokens.ts` lifting every value from `styles/tokens.css` (surfaces,
        brand, amber, semantic `pos`/`neg` + washes, text, radii, shadows) and the 8 people
        colours as `p1…p8`.
    - _Requirements: 3.1, 3.3, 3.4, 3.6_
  - [ ] 2.2 Create `src/theme/fonts.ts` registering `display` (Bricolage Grotesque) and `body`
        (Hanken Grotesk) families with tabular-figure settings for numeric text.
    - _Requirements: 3.5, 3.7_
  - [ ] 2.3 Create `src/theme/tamagui.config.ts` (dark-first default theme; structure tokens so a
        light theme can later be added by inverting surface/ink only), wire the root
        `tamagui.config.ts` re-export + babel plugin, and mount `TamaguiProvider` + `expo-font`
        loading (with system-font fallback) in `app/_layout.tsx`.
    - _Requirements: 3.2, 3.8, 2.2, 2.5_

- [ ] 3. Port the component kit to themed Tamagui components
  - [ ] 3.1 Create `src/lib/money.ts` `formatPence` (pence → `£x.xx`, signed variant, no
        fractional pence) and `src/components/Icon.tsx` (react-native-svg) with the kit glyph
        subset.
    - _Requirements: 4.4, 4.10_
  - [ ] 3.2 Port `Avatar` + `AvatarStack`: people-colour fill from `p1…p8` tokens, dashed
        placeholder variant, ring/dim variants, and `+N` overflow.
    - _Requirements: 4.1, 4.2, 4.11_
  - [ ] 3.3 Port `Money` using `formatPence` and `pos`/`neg` tokens with tabular figures.
    - _Requirements: 4.3, 4.4_
  - [ ] 3.4 Port `Button` (`brand·amber·ghost·line·pos`, `lg/md/sm`, press animation) and
        `IconBtn`.
    - _Requirements: 4.8_
  - [ ] 3.5 Port `BottomSheet` (backdrop, grab handle, optional title + close button, scrollable
        body) and `Chip` (active/inactive).
    - _Requirements: 4.7, 4.9_
  - [ ] 3.6 Build `ItemRow` (label + `Money` + assignment affordance, presentation only) and
        `SegmentedAssignment` (controlled `One·Split·Everyone·Custom`, selection only).
    - _Requirements: 4.5, 4.6_
  - [ ] 3.7 Add `src/components/index.ts` barrel exporting all primitives.
    - _Requirements: 4.12_

- [ ] 4. Add the API client adapter and TanStack Query provider
  - [ ] 4.1 Create `src/adapters/tokenProvider.ts` (`TokenProvider` type + `noopTokenProvider`)
        and `src/adapters/apiClient.ts` (`createApiClient` returning `{ core, receipts }` — one
        Eden/treaty client per Elysia app export (`@divvy-up/core` + `@divvy-up/receipt-service`),
        shared `onRequest` bearer-token injection, non-2xx → `NormalizedApiError`, base URLs from
        `EXPO_PUBLIC_API_URL` + `EXPO_PUBLIC_RECEIPT_API_URL` with local defaults).
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 5.7_
  - [ ] 4.2 Create `src/adapters/ApiClientProvider.tsx` (context + provider building the client
        once, accepting a swappable `getToken` prop) and `useApiClient`.
    - _Requirements: 5.5_
  - [ ] 4.3 Create `src/query/queryClient.ts` (shared `QueryClient` with mobile-appropriate
        retry/stale defaults) and mount `QueryClientProvider` + `ApiClientProvider`
        (default `noopTokenProvider`) in `app/_layout.tsx` in the correct nesting order.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 2.2_

- [ ] 5. Remove the web package and all its wiring
  - [ ] 5.1 Delete `packages/web` and `infra/web.ts`; remove `@divvy-up/web` from the workspace.
    - _Requirements: 7.1, 7.2_
  - [ ] 5.2 Edit `sst.config.ts` to drop the `web` import and `web` output, keeping `api` and
        `receiptApi` outputs resolvable.
    - _Requirements: 7.3, 7.5_
  - [ ] 5.3 Remove all `packages/web/**` path filters, `web` filter outputs, and `web` summary
        rows/branches from `.github/workflows/pr-checks.yml` and `pr-environment.yml`; verify a
        repo-wide search for `packages/web` returns no matches outside `.kiro/specs`.
    - _Requirements: 7.4, 7.6_

- [ ] 6. Tests and quality gates
  - [ ] 6.1 Unit-test `formatPence` (pence→`£x.xx`, sign, no fractional pence) and the API
        adapter (token present → bearer header; `noopTokenProvider` → no header; non-2xx →
        `NormalizedApiError`) against a mocked transport.
    - _Requirements: 8.2, 8.3_
  - [ ] 6.2 Component tests (RN Testing Library): `Avatar` placeholder/dashed + people colour,
        `Money` formatting/sign colours, `SegmentedAssignment` selection, `Button` variants,
        `BottomSheet` open/close, `Chip` states.
    - _Requirements: 8.1_
  - [ ] 6.3 Root smoke test mounting `_layout` providers + a placeholder screen without throwing.
    - _Requirements: 8.4_
  - [ ] 6.4 Run `turbo run typecheck`, `lint`, and `test:unit`; confirm `@divvy-up/mobile`
        passes and the repo is green after web removal; meet the mobile coverage threshold for
        new code.
    - _Requirements: 8.5, 8.6_
