# Tasks — Authentication

> Inherits `.kiro/steering/`. Implements `requirements.md` + `design.md` as **one PR** for
> feature #4. Ordered **frontend-first → backend → wire-up** per `steering/tech.md`. Each task
> is code/test and builds on the previous. Depends on `mobile-app-foundation` (Expo shell,
> Tamagui theme, component kit, API client adapter) and `data-and-persistence` (`users` table).

## Frontend — contract, screens, session adapter (against a mock)

- [ ] 1. Define the `AuthPort` contract and `Result`/`AuthError` types in
     `packages/mobile/src/domain/ports/auth.port.ts` (`AuthSession`, `OAuthProvider`, the nine
     methods). This is the FE↔adapter bridge the screens code against.
     _Requirements: 2.1, 3.1, 4.1, 5.1, 7.1, 8.1_

- [ ] 2. Implement `MockAuthAdapter implements AuthPort` in
     `packages/mobile/src/adapters/auth/mock.adapter.ts` — in-memory session, configurable
     success/error outcomes (invalid creds, email-taken, confirmation-required, cancelled).
     Add `__tests__` proving each outcome.
     _Requirements: 2.2, 2.4, 3.2, 4.4, 4.5_

- [ ] 3. Build the auth context `useAuth` in
     `packages/mobile/src/features/auth/AuthContext.tsx` — `{ session, status }`, restores via
     `getSession` on mount, subscribes via `onAuthStateChange`, exposes action methods; wired
     to the injected adapter (mock for now). Unit-test loading → authenticated/unauthenticated
     transitions.
     _Requirements: 5.2, 6.3, 6.4_

- [ ] 4. Build the **Onboarding** screen at `packages/mobile/app/(auth)/index.tsx` /
     `features/auth/OnboardingScreen.tsx` using the Tamagui theme + component kit; "Get
     started" → sign-up, "I already have an account" → login.
     _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 5. Build the **Sign-up** screen (`(auth)/sign-up.tsx`) — email/password fields, ≥8-char
     validation, in-flight disabled/loading, success routing, email-taken and
     confirmation-required states — against `MockAuthAdapter`. Add screen tests.
     _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 6. Build the **Login** screen (`(auth)/login.tsx`) — credentials, invalid-credentials
     banner, "Forgot password" → `resetPassword` confirmation, in-flight loading. Add tests.
     _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 7. Build the shared `SocialButtons` component (Google / Apple / Facebook; Apple shown
     native on iOS), wired through the adapter's `signInWithOAuth` / `signInWithApple`; handle
     cancel (silent) vs. failure (banner). Place on both auth screens. Add tests via the mock.
     _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 8. Implement the **expo-router guard** in `packages/mobile/app/_layout.tsx`: splash while
     `status === "loading"`; keep unauth users in `(auth)` and auth users in `(app)` with
     `Redirect`; re-route on auth-state change without flashing an auth screen to an
     authenticated user. Add guard tests for both directions and the loading case.
     _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 9. Add a **sign-out** action (e.g. in a settings/profile entry point or header menu)
     calling `signOut`, clearing the session and routing back to `(auth)`. Test via mock.
     _Requirements: 7.1, 7.2_

## Frontend — token injection

- [ ] 10. Wire the `mobile-app-foundation` API client **token-provider** to call
      `authAdapter.getAccessToken()` per request and attach `Authorization: Bearer <token>`;
      send no header when there is no session. Read fresh each request (no stale capture).
      Unit-test header present with session, absent without, and refreshed-token usage.
      _Requirements: 8.1, 8.2, 8.3, 8.4_

## Backend — JWKS verification middleware

- [ ] 11. Create `packages/api-utils/src/auth/supabaseAuth.ts` with `SupabaseUser`, a
      per-warm-Lambda-cached `getJwks()` (built from `SUPABASE_URL/auth/v1/.well-known/jwks.json`),
      `getAuthUser(authHeader)` (verify via `jose`; `null` on missing/invalid), `requireAuth`
      (sets `401 { message: "Unauthorized" }`), and `getUser`. Keep `getJwks()` outside the
      verify try/catch so a missing `SUPABASE_URL` surfaces as `500`. Export from `api-utils`.
      _Requirements: 9.1, 9.2, 9.3, 9.4, 10.1, 10.2, 10.3, 10.4_

- [ ] 12. Add Vitest unit tests for the auth module (mock `jose`): valid → claims, missing
      header → `null`, bad-signature/expired → `null`; `requireAuth` 401 path; JWKS memoized
      once; missing `SUPABASE_URL` throws.
      _Requirements: 9.1, 9.2, 9.4, 10.1, 10.2_

## Backend — attach authorizer in infra

- [ ] 13. Update `infra/api.ts`: replace `// TODO: add JWT authorizer` by linking `SUPABASE_URL`
      (via `sst.Secret`/env) to **both** `coreAPI` and `receiptServiceAPI` routes so the
      in-app middleware can verify on each service.
      _Requirements: 9.5, 10.1_

- [ ] 14. Apply the auth middleware in `microservices/core/src/api.ts` and
      `microservices/other-service/src/api.ts` — `.derive(...)` to attach `user` (+ later
      `userId`) and `.onBeforeHandle(requireAuth)` — so every route on both gateways is
      protected and handlers can read the verified user.
      _Requirements: 9.3, 9.5, 10.4_

## Backend — user provisioning

- [ ] 15. Implement `provisionUser(claims)` in `packages/api-utils/src/auth/provisionUser.ts`
      against `packages/db` `users` — `INSERT … ON CONFLICT (supabase_sub) DO NOTHING RETURNING id`
      then resolve the internal `userId`; idempotent and concurrency-safe. Vitest: creates on
      first call, reuses on second, no duplicate under concurrent calls, `500` on DB error.
      _Requirements: 11.1, 11.2, 11.3, 11.5_

- [ ] 16. Extend the `.derive()` in both services to call `provisionUser(user)` for verified
      requests and expose `ctx.userId`; confirm a handler can read it and scope a query to it.
      _Requirements: 11.1, 11.4, 9.3_

## Wire-up — real client + integration

- [ ] 17. Implement `SupabaseAuthAdapter implements AuthPort` in
      `packages/mobile/src/adapters/auth/supabase.adapter.ts`: `createClient` with
      `storage: AsyncStorage`, `autoRefreshToken`, `persistSession`, `detectSessionInUrl: false`,
      `lock: processLock`; `AppState` listener start/stop auto-refresh + `destroy()`; email
      sign-up/in, `resetPassword`, `refreshSession`, `getAccessToken`, `signOut`, session
      mapping. Read `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Unit-test
      session mapping + AppState behavior.
      _Requirements: 5.1, 5.3, 5.4, 5.5, 5.6, 7.1_

- [ ] 18. Implement social sign-in in the adapter: Google/Facebook via
      `signInWithOAuth({ skipBrowserRedirect: true })` + `WebBrowser.openAuthSessionAsync` with a
      `Linking.createURL("auth/callback")` redirect and per-provider account-picker query params;
      Apple via `expo-apple-authentication` → `signInWithIdToken`. Handle cancel → `cancelled`.
      Test OAuth token extraction (hash vs. query) and cancel handling.
      _Requirements: 4.2, 4.3, 4.4, 4.5_

- [ ] 19. Swap the injected adapter from `MockAuthAdapter` to `SupabaseAuthAdapter` at the app
      root (provide via the auth context), keeping the mock available for tests.
      _Requirements: 5.2, 6.3, 8.1_

- [ ] 20. End-to-end integration: against a test Supabase project, log in → token injected →
      protected route on each gateway returns `401` without a token and `200` with a valid
      token; assert the handler receives the provisioned `userId`; assert refresh-token
      expiry clears the session and routes to `(auth)`.
      _Requirements: 5.6, 6.1, 8.2, 9.1, 9.5, 10.1, 10.2, 11.1, 11.4_

- [ ] 21. Final pass: typecheck + lint + prettier across changed packages, meet the coverage
      bar, ensure CI is green. (The web Login stub is removed with `packages/web` per the
      `mobile-app-foundation` spec.)
      _Requirements: 1.4, 6.1, 9.5_
