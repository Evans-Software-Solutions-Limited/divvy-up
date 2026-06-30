# Requirements — Mobile App Foundation

## Introduction

This is **feature #1**, the frontend foundation that every later Divvy Up feature builds on. It
stands up the Expo + expo-router mobile app (`packages/mobile`), generates a Tamagui theme from
the design prototype's tokens, ports the prototype component kit into reusable Tamagui
components, and wires the client-side plumbing (typed Eden/treaty API client adapter with an
injectable token provider, plus a TanStack Query provider). It also **removes the scaffolded
`packages/web`** and all of its infrastructure and CI references, since there is no web app in
scope (see `steering/product.md`).

This feature delivers the **shell + design system + client plumbing only**. It implements **no
auth logic and no data feature** — screens are placeholder/empty, the API client is constructed
with a no-op token provider (auth wires the real one later), and no domain queries are issued.
It is delivered as **one shippable PR** per the delivery model in `steering/tech.md`.

Scope is bounded by the steering docs:

- Money is integer pence; display formats to `£x.xx` at the view layer only (`steering/tech.md`).
- People-colour system is an 8-colour fixed palette (`--p1…--p8`); avatars are the core visual
  primitive (`HANDOFF.md`, `steering/product.md`).
- Dark-first warm-indigo palette, semantic money colours (`--pos`/`--neg`), Bricolage Grotesque
  (display) + Hanken Grotesk (body).
- Shared UI primitives belong to this feature; feature-specific screens belong to their own spec
  (`steering/structure.md`).

---

## Requirements

### Requirement 1 — Expo app scaffold in the monorepo

**User Story:** As a developer, I want an Expo + expo-router app at `packages/mobile` wired into
the Bun/Turbo monorepo, so that all later mobile features have a runnable, type-checked home.

#### Acceptance Criteria

1. THE SYSTEM SHALL provide a `packages/mobile` workspace package named `@divvy-up/mobile`
   registered under the root `workspaces` globs.
2. THE SYSTEM SHALL use Expo (managed workflow) with `expo-router` as the navigation layer.
3. WHEN a developer runs the mobile `dev` task THE SYSTEM SHALL start the Expo dev server
   without errors.
4. THE SYSTEM SHALL expose `typecheck`, `lint`, and `test` (Jest) scripts that conform to the
   shared `turbo.json` task graph so `turbo run typecheck|lint|test:unit` includes the package.
5. WHERE the package defines TypeScript config THE SYSTEM SHALL pass `tsc --noEmit` with no
   errors on a clean checkout.
6. THE SYSTEM SHALL target iOS and Android via Expo with no platform-specific code required to
   render the shell.

### Requirement 2 — Navigation shell with auth/app layout groups

**User Story:** As a user, I want the app to open into a coherent navigation shell, so that I can
move between the authenticated tabbed area and the pre-auth area as later features fill them in.

#### Acceptance Criteria

1. THE SYSTEM SHALL define two expo-router layout groups: `(auth)/` for pre-authentication
   screens and `(app)/` for authenticated screens.
2. THE SYSTEM SHALL provide a root layout (`app/_layout.tsx`) that mounts the theme, fonts,
   query, and client-adapter providers around the router.
3. THE SYSTEM SHALL render a bottom tab navigator inside `(app)/` with placeholder tabs for
   Home, Groups, Activity, and Profile, each showing an empty/placeholder screen.
4. WHILE the app has no auth state (this feature) THE SYSTEM SHALL render a chosen default route
   without crashing, using placeholder screens only.
5. WHEN a font asset fails to load THE SYSTEM SHALL fall back to the system font and still render
   all screens.
6. THE SYSTEM SHALL NOT implement any sign-in, sign-up, session, or redirect/guard logic
   (deferred to the `authentication` feature); navigation between groups is via placeholder
   controls only.

### Requirement 3 — Tamagui theme generated from design tokens

**User Story:** As a developer, I want a Tamagui theme built from the prototype's design tokens,
so that every component renders with the locked Divvy Up visual language.

#### Acceptance Criteria

1. THE SYSTEM SHALL define a Tamagui config whose color tokens map 1:1 to
   `~/Downloads/Divvy Up/styles/tokens.css` (surfaces, brand, amber, semantic money, text,
   people palette).
2. THE SYSTEM SHALL be **dark-first**: the default theme uses the dark token values.
3. THE SYSTEM SHALL expose semantic money tokens `pos` and `neg` (and their wash variants)
   mapped from `--pos`/`--neg`.
4. THE SYSTEM SHALL expose the 8-colour people palette as named tokens `p1`…`p8` mapped from
   `--p1`…`--p8`.
5. THE SYSTEM SHALL register two font families — a `display` family (Bricolage Grotesque) and a
   `body` family (Hanken Grotesk) — and load their assets via `expo-font`.
6. THE SYSTEM SHALL define radius and shadow tokens mapped from `--r-*` and `--shadow-*`.
7. WHERE numeric/money text is rendered THE SYSTEM SHALL apply tabular-figure font settings so
   amounts align in columns.
8. WHERE a light theme is later required THE SYSTEM SHALL structure tokens so a light theme can
   be added by inverting surface/ink tokens without changing brand, people, or semantic tokens
   (per `HANDOFF.md`); a light theme stub MAY be included but is not required to be complete.

### Requirement 4 — Ported component kit as reusable Tamagui components

**User Story:** As a developer, I want the prototype component kit ported to Tamagui, so that
later features assemble screens from consistent, themed primitives instead of re-styling.

#### Acceptance Criteria

1. THE SYSTEM SHALL port the **people-colour Avatar** primitive: a circular initials avatar
   coloured from a member's people-palette colour, with a **dashed** outline variant for
   accountless placeholder members, plus a ring and dimmed variant.
2. THE SYSTEM SHALL port an **AvatarStack** that overlaps up to N avatars and renders a `+N`
   overflow token.
3. THE SYSTEM SHALL port a **Money** display component that accepts an amount **in pence**,
   formats to `£x.xx`, and colours positive/negative amounts with the `pos`/`neg` tokens when a
   signed display is requested.
4. WHEN `Money` is given a value in pence THE SYSTEM SHALL never display fractional pence and
   SHALL render with tabular figures.
5. THE SYSTEM SHALL port an **ItemRow** component (a receipt line-item row: label, amount,
   assignment affordance) suitable for later assignment screens.
6. THE SYSTEM SHALL port a **segmented assignment control** offering the four modes
   `One · Split · Everyone · Custom` as a controlled selection component (no assignment logic,
   selection state only).
7. THE SYSTEM SHALL port a **BottomSheet** component with a backdrop, grab handle, optional
   title with a close button, and a scrollable body.
8. THE SYSTEM SHALL port a **Button** set (`brand`, `amber`, `ghost`, `line`, `pos` variants and
   `lg/md/sm` sizes) and an **IconBtn**, with a press-state animation.
9. THE SYSTEM SHALL port a **Chip/pill** component with active/inactive states.
10. THE SYSTEM SHALL provide a small **Icon** set covering the glyphs used by the ported
    components.
11. WHERE a component is people-coloured THE SYSTEM SHALL source the colour from the people
    palette tokens, not from hard-coded hex values.
12. THE SYSTEM SHALL place all ported primitives under `packages/mobile/src/components/` and
    export them from a single barrel for reuse by later features.

### Requirement 5 — Typed API client adapter with injectable token provider

**User Story:** As a developer, I want a typed Eden/treaty API client adapter with a pluggable
token provider, so that UI can call the backend type-safely and the auth feature can later inject
real tokens without changing call sites.

#### Acceptance Criteria

1. THE SYSTEM SHALL provide an API client adapter built on Eden/treaty, typed against the
   Elysia app's exported types (no hand-written duplicate request/response types, per
   `steering/structure.md`).
2. THE SYSTEM SHALL accept a **token provider** — an injected async function returning the
   current auth token (or `null`) — and attach it as a bearer `Authorization` header on each
   request when a token is present.
3. WHILE no token provider is configured (this feature's default) THE SYSTEM SHALL use a
   **no-op provider** that resolves to `null`, and SHALL issue requests without an
   `Authorization` header.
4. THE SYSTEM SHALL read **both** API base URLs from typed Expo environment config
   (`EXPO_PUBLIC_API_URL` for coreAPI and `EXPO_PUBLIC_RECEIPT_API_URL` for the separate
   receiptServiceAPI gateway), each with a sensible local default, and build one typed treaty
   client per service.
5. THE SYSTEM SHALL expose the client via a React context/provider so the token provider can be
   swapped (by the auth feature) at the app root without touching call sites.
6. IF a request returns a non-2xx response THEN THE SYSTEM SHALL surface a normalized error
   object (status, code/message) that callers and TanStack Query can consume.
7. THE SYSTEM SHALL place the adapter under `packages/mobile/src/adapters/`.

### Requirement 6 — TanStack Query provider

**User Story:** As a developer, I want a configured TanStack Query provider at the app root, so
that later features manage server state with caching, retries, and a single query client.

#### Acceptance Criteria

1. THE SYSTEM SHALL mount a single `QueryClientProvider` at the app root with a shared
   `QueryClient`.
2. THE SYSTEM SHALL configure sensible defaults (retry, stale time) appropriate for a mobile
   client.
3. THE SYSTEM SHALL make the API client adapter available to query/mutation functions (via the
   client context) so later features can write typed queries.
4. THE SYSTEM SHALL NOT register any feature-specific queries (deferred to later features).

### Requirement 7 — Removal of the web package and its infrastructure

**User Story:** As a maintainer, I want the scaffolded web app and all its wiring removed, so
that the repo reflects the mobile-only product scope and CI/infra stay green.

#### Acceptance Criteria

1. THE SYSTEM SHALL delete the `packages/web` directory and remove `@divvy-up/web` from the
   workspace.
2. THE SYSTEM SHALL delete `infra/web.ts`.
3. THE SYSTEM SHALL remove the `web` import and the `web` output from `sst.config.ts` while
   keeping the `api` and `receiptApi` outputs intact.
4. THE SYSTEM SHALL remove all `packages/web/**` path filters and `web` filter outputs/branches
   from `.github/workflows/pr-checks.yml` and `.github/workflows/pr-environment.yml`, including
   the `Web` row from any PR-environment summary.
5. WHEN web references are removed THE SYSTEM SHALL leave `sst deploy`/`sst dev` able to resolve
   `sst.config.ts` with no reference to the removed `frontend` site.
6. IF any remaining file references `packages/web` THEN THE SYSTEM SHALL be considered incomplete
   (a repo-wide search for `packages/web` must return no matches outside `.kiro/specs`).

### Requirement 8 — Foundation tests and quality gates

**User Story:** As a maintainer, I want the foundation covered by tests passing the repo's
quality gates, so that later features build on a verified base.

#### Acceptance Criteria

1. THE SYSTEM SHALL include Jest + React Native Testing Library tests for the ported component
   kit covering rendering and key variants (avatar placeholder/dashed, money formatting/sign
   colours, segmented control selection, button variants, sheet open/close).
2. THE SYSTEM SHALL include a unit test for money formatting proving pence-in → `£x.xx`-out with
   no fractional pence.
3. THE SYSTEM SHALL include a test for the API client adapter proving the token provider injects
   a bearer header when a token is present and omits it when the provider returns `null`.
4. THE SYSTEM SHALL include a smoke/render test that mounts the root layout with all providers
   and renders a placeholder screen without throwing.
5. WHEN `turbo run typecheck`, `turbo run lint`, and `turbo run test:unit` are run THE SYSTEM
   SHALL pass for `@divvy-up/mobile` and SHALL still pass for the rest of the repo after web
   removal.
6. WHERE the repo enforces a mobile coverage threshold THE SYSTEM SHALL meet it for the code
   introduced by this feature.
