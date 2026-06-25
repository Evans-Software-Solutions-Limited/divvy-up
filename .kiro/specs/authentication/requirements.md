# Requirements — Authentication

> Inherits `.kiro/steering/` (product, tech, structure). Feature #4 in the spec index — one
> shippable PR (FE + BE). **Depends on** `mobile-app-foundation` (Expo shell, Tamagui theme,
> ported component kit, API client adapter) and `data-and-persistence` (`packages/db`, the
> `users` table). This spec **owns designing** the onboarding/sign-up/login screens — they are
> explicitly _not yet designed_ in the prototype (see HANDOFF Q4).

## Introduction

Divvy Up uses **Supabase Auth** for identity and **JWKS verification on the API** for trust.
The mobile app holds the Supabase session (persisted in AsyncStorage, auto-refreshed,
re-checked on foreground) and injects the access token on every API request. The backend
verifies that token against Supabase's JWKS using `jose` — cached per warm Lambda — derives a
verified `userId` for handlers, and rejects missing/invalid tokens with `401`. On the first
authenticated request, the backend provisions a row in the `users` table linking the Supabase
`sub` to a Divvy Up user. Per `steering/tech.md`, **all later queries scope to this `userId`**
and the user's group memberships.

Supabase is used **only** for authentication (session + token lifecycle). All business data
flows through the SST/Elysia API, never through Supabase directly.

This feature delivers, end to end:

- Mobile **onboarding**, **sign-up**, and **login** screens (email/password + social: Google,
  Apple, Facebook).
- A **session adapter** (the `AuthPort`) wrapping the Supabase JS client with AsyncStorage
  persistence, `autoRefreshToken`, `processLock`, and an `AppState` re-check.
- The **expo-router `(auth)` / `(app)` guard** routing unauthenticated users to auth and
  authenticated users into the app.
- **Token injection** into the foundation's API client token-provider.
- Backend **JWKS verification middleware** (`getAuthUser` + `requireAuth`) attached on
  **both** `coreAPI` and `receiptServiceAPI`.
- **First-login user provisioning** (Supabase `sub` → `users` row).

---

## Requirements

### Requirement 1 — Onboarding entry

**User Story:** As a first-time visitor, I want a welcoming onboarding screen that explains
Divvy Up and offers ways in, so that I understand the app and can start signing up or logging in.

#### Acceptance Criteria

1. WHEN an unauthenticated user opens the app for the first time THE SYSTEM SHALL display the
   onboarding screen with the Divvy Up value proposition and primary "Get started" and
   secondary "I already have an account" actions.
2. WHEN the user taps "Get started" THE SYSTEM SHALL navigate to the sign-up screen.
3. WHEN the user taps "I already have an account" THE SYSTEM SHALL navigate to the login screen.
4. THE SYSTEM SHALL render onboarding/auth screens using the Tamagui theme and ported
   component kit from `mobile-app-foundation` (warm-indigo dark-first palette, Bricolage
   Grotesque display / Hanken Grotesk body).

### Requirement 2 — Sign up with email and password

**User Story:** As a new user, I want to create an account with my email and a password, so
that I can use Divvy Up.

#### Acceptance Criteria

1. WHEN the user submits a valid email and password on the sign-up screen THE SYSTEM SHALL call
   the auth adapter's `signUpWithEmail` and, on success with an active session, route the user
   into the app.
2. IF the submitted email is already registered THEN THE SYSTEM SHALL display an
   "email already in use" message and remain on the sign-up screen.
3. IF the password does not meet the minimum policy (at least 8 characters) THEN THE SYSTEM
   SHALL block submission and show an inline validation message.
4. WHERE Supabase requires email confirmation before issuing a session THE SYSTEM SHALL display
   a "check your email to confirm" message rather than routing into the app.
5. WHILE a sign-up request is in flight THE SYSTEM SHALL disable the submit control and show a
   loading state.

### Requirement 3 — Log in with email and password

**User Story:** As a returning user, I want to log in with my email and password, so that I can
get back into my groups and expenses.

#### Acceptance Criteria

1. WHEN the user submits valid credentials on the login screen THE SYSTEM SHALL call the auth
   adapter's `signInWithEmail` and, on success, route the user into the app.
2. IF the credentials are invalid THEN THE SYSTEM SHALL display an "incorrect email or password"
   message and remain on the login screen.
3. WHEN the user taps "Forgot password" THE SYSTEM SHALL call `resetPassword` with the entered
   email and confirm that a reset email has been sent.
4. WHILE a login request is in flight THE SYSTEM SHALL disable the submit control and show a
   loading state.

### Requirement 4 — Social login

**User Story:** As a user, I want to sign in with Google, Apple, or Facebook, so that I can get
started without managing another password.

#### Acceptance Criteria

1. THE SYSTEM SHALL offer Google, Apple, and Facebook sign-in options on both the sign-up and
   login screens.
2. WHEN the user selects Google or Facebook THE SYSTEM SHALL start the Supabase OAuth flow in a
   browser auth session and, on a successful redirect, establish a Supabase session and route
   into the app.
3. WHERE the platform is iOS and the user selects Apple THE SYSTEM SHALL use native Sign in with
   Apple (`signInWithApple`) and exchange the Apple identity token with Supabase via
   `signInWithIdToken`.
4. IF the OAuth/Apple flow is cancelled by the user THEN THE SYSTEM SHALL treat it as a silent
   no-op and remain on the current auth screen without an error banner.
5. IF the OAuth/Apple flow fails (no tokens, provider error) THEN THE SYSTEM SHALL display a
   "could not sign in, please try again" message.

### Requirement 5 — Session persistence and refresh

**User Story:** As a user, I want to stay logged in across app launches without re-entering
credentials, so that the app feels fast and personal.

#### Acceptance Criteria

1. THE SYSTEM SHALL persist the Supabase session in AsyncStorage so it survives app restarts.
2. WHEN the app launches with a persisted, valid session THE SYSTEM SHALL restore it and route
   the user into the app without showing a login screen.
3. WHILE the app is in the foreground THE SYSTEM SHALL auto-refresh the access token before it
   expires (`autoRefreshToken`) and stop auto-refresh when backgrounded.
4. WHEN the app returns to the foreground (`AppState` becomes `active`) THE SYSTEM SHALL
   re-check / restart token auto-refresh.
5. THE SYSTEM SHALL serialize concurrent session access using Supabase's `processLock` to avoid
   refresh races.
6. IF the refresh token is expired or revoked THEN THE SYSTEM SHALL clear the local session and
   route the user back to the auth screens.

### Requirement 6 — Route guarding `(auth)` / `(app)`

**User Story:** As a user, I want the app to send me to the right place based on whether I'm
signed in, so that I never see screens I shouldn't.

#### Acceptance Criteria

1. WHILE there is no authenticated session THE SYSTEM SHALL keep the user within the `(auth)`
   route group and redirect any attempt to reach an `(app)` route to the login/onboarding flow.
2. WHILE there is an authenticated session THE SYSTEM SHALL keep the user within the `(app)`
   route group and redirect any attempt to reach an `(auth)` route into the app.
3. WHILE the initial session restore is still resolving THE SYSTEM SHALL show a splash/loading
   state and SHALL NOT flash an auth screen to an already-authenticated user.
4. WHEN the auth state changes (sign-in or sign-out) THE SYSTEM SHALL react to the change and
   re-route to the correct group automatically.

### Requirement 7 — Sign out

**User Story:** As a user, I want to sign out, so that my account is not accessible on a shared
or lost device.

#### Acceptance Criteria

1. WHEN the user triggers sign-out THE SYSTEM SHALL call the adapter's `signOut`, clear the
   persisted session, and route the user back to the auth screens.
2. WHEN sign-out completes THE SYSTEM SHALL ensure subsequent API requests carry no access token.

### Requirement 8 — Token injection on API requests

**User Story:** As a developer, I want the API client to attach the current access token to
every request automatically, so that handlers always receive an authenticated caller without
per-call wiring.

#### Acceptance Criteria

1. THE SYSTEM SHALL wire the `mobile-app-foundation` API client token-provider to read the
   current Supabase access token from the auth adapter (`getAccessToken`).
2. WHEN any API request is made with an active session THE SYSTEM SHALL attach the token as an
   `Authorization: Bearer <token>` header.
3. IF there is no active session THEN THE SYSTEM SHALL send the request without an
   `Authorization` header (the backend will respond `401` for protected routes).
4. THE SYSTEM SHALL always read the token fresh per request so that a refreshed token is used
   rather than a stale captured value.

### Requirement 9 — Backend JWT verification (JWKS)

**User Story:** As the API, I want to cryptographically verify incoming Supabase JWTs, so that
only genuine, unexpired tokens are trusted.

#### Acceptance Criteria

1. THE SYSTEM SHALL verify the `Authorization: Bearer` token against Supabase's JWKS endpoint
   (`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`) using `jose`'s `createRemoteJWKSet` +
   `jwtVerify`.
2. THE SYSTEM SHALL cache the JWKS key set per warm Lambda instance and reuse it across
   invocations rather than re-fetching on every request.
3. WHEN verification succeeds THE SYSTEM SHALL expose the verified claims (`sub`, `email`,
   `email_verified`, `iat`, `exp`) to handlers via an Elysia `.derive()`-provided `user`.
4. IF `SUPABASE_URL` is not configured THEN THE SYSTEM SHALL surface a server error (`500`),
   not a `401`, because that is a deployment misconfiguration.
5. THE SYSTEM SHALL apply verification on **both** `coreAPI` and `receiptServiceAPI`.

### Requirement 10 — 401 on missing or invalid token

**User Story:** As the API, I want to reject unauthenticated or invalid requests, so that
protected data is never served to an unverified caller.

#### Acceptance Criteria

1. IF a protected route is called with no `Authorization` header THEN THE SYSTEM SHALL respond
   `401 Unauthorized` and SHALL NOT execute the handler.
2. IF the bearer token is malformed, has an invalid signature, or is expired THEN THE SYSTEM
   SHALL respond `401 Unauthorized`.
3. WHEN the API responds `401` THE SYSTEM SHALL return a structured JSON body
   (`{ message: "Unauthorized" }`) consistent with the global error handler shape.
4. WHILE handling an authenticated request THE SYSTEM SHALL guarantee that `requireAuth` has run
   before any handler logic, so handlers can read a non-null verified `userId`.

### Requirement 11 — First-login user provisioning

**User Story:** As a new authenticated user, I want my account to be set up automatically on
first use, so that I can immediately create groups and expenses scoped to me.

#### Acceptance Criteria

1. WHEN an authenticated request arrives and no `users` row exists for the verified `sub` THE
   SYSTEM SHALL create a `users` row with `id = sub` (capturing `email` and, where available, a
   display name derived from `email` / `user_metadata`).
2. WHEN a `users` row already exists for the `sub` THE SYSTEM SHALL reuse it and SHALL NOT
   create a duplicate.
3. THE SYSTEM SHALL make provisioning idempotent and safe under concurrent first requests
   (upsert / `ON CONFLICT (id) DO NOTHING` keyed on `id = sub`).
4. WHEN provisioning resolves THE SYSTEM SHALL make `userId` (== the Supabase `sub`) available to
   handlers as the value all subsequent queries scope to.
5. IF provisioning fails (database error) THEN THE SYSTEM SHALL surface a `500` via the global
   error handler and SHALL NOT proceed with the handler's business logic.
