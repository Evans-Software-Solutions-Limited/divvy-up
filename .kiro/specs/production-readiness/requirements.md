# Requirements — production-readiness

## Introduction

This is feature **#9 (`production-readiness`)** — the final hardening spec, delivered as **one
shippable PR** that depends on all prior features (1–8). It does **not** re-implement product
features; it assembles the per-feature tests already written into **enforced CI gates** and adds
the operational scaffolding needed to ship Divvy Up to the App Store and Google Play.

The audience for these requirements is **operators, release managers, and on-call engineers** —
the people who deploy, observe, and answer the pager. The scope mirrors the maturity of the
reference app `persistence-backend-sst` and Phase 6 of `docs/release-readiness-plan.md`.

In scope:

- A **global structured Elysia error handler** applied across both services (`core` and
  `other-service`): request-id correlation via `x-amz-request-id`, prod-safe stack traces, a
  consistent error shape, and deterministic status mapping.
- **Coverage gates** in CI: Vitest v8 thresholds (target the reference's ~90%) for backend and
  shared packages, and Jest thresholds for mobile.
- A **preprod stage** plus its deploy workflow (currently missing per
  `docs/next-steps-deployments.md`), giving a `PR → preprod → production` promotion path.
- **`sst.Secret` wiring per environment** with **fail-fast** behaviour when a required secret is
  absent.
- **Per-stage custom domains** under `infra/domains/`.
- **Basic observability**: CloudWatch log conventions and alarms on error-rate / fatal signals.
- **Mobile release pipelines**: EAS build profiles (`staging`/`production`) and submit workflows
  to TestFlight and the Play internal track.
- A **store-submission readiness checklist** with the required assets and metadata (icons,
  splash, privacy policy, permission strings for camera/photos).

Out of scope: product/feature behaviour (owned by specs 1–8), real money movement, and any
infrastructure not required for a first store release.

Stage / environment vocabulary used throughout (aligns with
`docs/next-steps-deployments.md §5`):

| Stage         | Trigger                          | Account            |
| ------------- | -------------------------------- | ------------------ |
| `pr-{number}` | `ready-for-test` label on a PR   | Dev / PR account   |
| `preprod`     | Push / merge to `main`           | Preprod account    |
| `production`  | Release Please release published | Production account |

---

## Requirements

### Requirement 1 — Uniform structured error handling across both services

**User Story:** As an on-call engineer, I want every API error from both services to come back in
one consistent, machine-readable shape, so that I can triage incidents without learning a
different error format per endpoint.

#### Acceptance Criteria

1. THE SYSTEM SHALL expose a single reusable Elysia error-handler plugin that is registered with
   global scope (`onError({ as: "global" }, …)`) on **both** the `core` and `other-service`
   Elysia apps.
2. WHEN any handler throws or returns an error THE SYSTEM SHALL respond with a JSON body
   containing at least `code`, `error`, and `detail` fields, plus `requestId` when available.
3. WHEN an Elysia validation error occurs THE SYSTEM SHALL respond with HTTP `422` and include the
   structured `validation` details in the body.
4. WHEN a not-found error occurs THE SYSTEM SHALL respond with HTTP `404`; WHEN a parse error
   occurs THE SYSTEM SHALL respond with HTTP `400`; and IF the error has no recognised code THEN
   THE SYSTEM SHALL respond with HTTP `500`.
5. THE SYSTEM SHALL emit one structured log line per error of the form
   `[api:error] <METHOD> <PATH> → <STATUS> · <json>` where `<json>` includes `code`, `message`,
   and `requestId`.
6. THE SYSTEM SHALL provide a domain error type (e.g. `AppError` carrying an explicit HTTP status
   and code) so that services can raise typed errors that map deterministically to responses.

### Requirement 2 — Request-id correlation

**User Story:** As an on-call engineer, I want each error response and log line tagged with the
same request id, so that I can pivot from a user's error report straight to the matching
CloudWatch logs.

#### Acceptance Criteria

1. WHEN an inbound request carries an `x-amz-request-id` header THE SYSTEM SHALL include that value
   as `requestId` in both the error response body and the `[api:error]` log line.
2. WHERE the `x-amz-request-id` header is absent THE SYSTEM SHALL omit `requestId` from the
   response body rather than emitting an empty or fabricated value.
3. THE SYSTEM SHALL log the `requestId` against successful 4xx/5xx responses consistently so a
   single id correlates the client-visible error with the server log.

### Requirement 3 — No stack-trace or internal-detail leakage in production

**User Story:** As a release manager, I want production error responses to never leak stack traces
or internal messages, so that we don't expose implementation details or sensitive data to end
users (CWE-209).

#### Acceptance Criteria

1. WHILE the stage is `production` THE SYSTEM SHALL omit the `stack` field (and any cause-chain
   detail) from every error response body.
2. WHILE the stage is a non-production stage (e.g. `preprod`, `pr-*`, dev) THE SYSTEM SHALL include
   `stack` (and cause-chain detail where available) to aid debugging.
3. IF a `5xx` error occurs WHILE the stage is `production` THEN THE SYSTEM SHALL replace `detail`
   with a generic message (e.g. "An internal error occurred. See server logs for details.") while
   still logging the full detail server-side.
4. WHEN a `4xx` error occurs THE SYSTEM SHALL preserve the human-readable `detail` regardless of
   stage, because clients need it to map errors to input fields.
5. THE SYSTEM SHALL determine the active stage from the SST stage environment variable
   (`SST_STAGE`) and treat only the exact value `production` as production.

### Requirement 4 — Coverage gates enforced in CI

**User Story:** As a release manager, I want CI to fail when test coverage drops below the bar, so
that the production bar set by the reference app cannot silently erode.

#### Acceptance Criteria

1. THE SYSTEM SHALL configure Vitest v8 coverage thresholds of **90%** for `lines`, `functions`,
   `branches`, and `statements` on the `core` and `other-service` microservices and on shared
   packages that ship logic (`split-engine`, `api-utils`, `db`).
2. WHEN the unit-test job runs in CI THE SYSTEM SHALL execute coverage and IF any configured
   threshold is not met THEN THE SYSTEM SHALL fail the job.
3. THE SYSTEM SHALL configure mobile **Jest** coverage thresholds and run them as a CI gate for
   `packages/mobile`.
4. THE SYSTEM SHALL run the coverage gates on **PR checks**, **preprod deploy**, and **production
   deploy** so coverage is enforced before any environment is updated.
5. WHERE a file is a non-testable entrypoint (e.g. `src/api.ts`, `src/index.ts`) THE SYSTEM SHALL
   exclude it from coverage measurement via the Vitest `exclude` list rather than lowering the
   threshold.

### Requirement 5 — Pre-production environment and deploy workflow

**User Story:** As a release manager, I want every merge to `main` to deploy automatically to a
preprod environment, so that changes are validated in a production-like stage before a release.

#### Acceptance Criteria

1. THE SYSTEM SHALL define a `preprod` SST stage deployed into the pre-production AWS account.
2. WHEN a commit is pushed/merged to `main` THE SYSTEM SHALL run a preprod deploy workflow that
   runs typecheck, lint, prettier, build, and the coverage gates before deploying.
3. WHEN the preprod deploy runs THE SYSTEM SHALL assume the preprod AWS role
   (`AWS_ROLE_ARN_PREPROD`) via GitHub OIDC and deploy with `sst deploy --stage preprod`.
4. IF the head commit is a Release Please commit (e.g. message contains `release-please` or
   `Release `) THEN THE SYSTEM SHALL skip the preprod deploy to avoid double-deploying a release.
5. THE SYSTEM SHALL serialise preprod deploys via a concurrency group (no two preprod deploys at
   once) and clear any stale SST lock before deploying.
6. THE SYSTEM SHALL keep production deploys gated on a **published Release Please release**, so the
   promotion path is `PR → preprod (on merge) → production (on release)`.

### Requirement 6 — Secret presence enforcement (fail-fast)

**User Story:** As an operator, I want a deploy to fail loudly and early when a required secret is
missing for that environment, so that we never ship a stage that boots without its database URL or
auth configuration.

#### Acceptance Criteria

1. THE SYSTEM SHALL declare all required runtime secrets as `sst.Secret` values in
   `infra/secrets.ts` (at minimum the database connection string and the Supabase configuration
   needed for JWKS verification).
2. WHEN a deploy workflow runs for a stage THE SYSTEM SHALL verify each required secret is present
   in that environment's GitHub secrets, and IF any required secret is empty or unset THEN THE
   SYSTEM SHALL fail the job with an actionable error naming the missing secret and where to set
   it, **before** running `sst deploy`.
3. WHEN required secrets are present THE SYSTEM SHALL push them into the stage with
   `sst secret set <Name> <value> --stage <stage>` prior to deploy.
4. THE SYSTEM SHALL inject the secret values into both Lambda functions' environment so the
   running services can read them at request time.
5. THE SYSTEM SHALL never store secret values in git or in the SST config; secrets flow only from
   GitHub environment secrets into the stage at deploy time.

### Requirement 7 — Per-stage custom domains

**User Story:** As a release manager, I want each stage's API to be reachable at a stable,
stage-specific custom domain, so that mobile build profiles and testers point at predictable URLs
instead of churning API Gateway hostnames.

#### Acceptance Criteria

1. THE SYSTEM SHALL provide an `infra/domains/` module that maps each stage to its API host and
   hosted-zone id (a pure stage→config function plus its SST wiring).
2. WHERE a stage has a configured custom domain THE SYSTEM SHALL attach that domain (with the
   correct hosted-zone DNS) to the `coreAPI` API Gateway for that stage.
3. WHERE a stage has **no** configured custom domain (e.g. `pr-*` and personal dev stages) THE
   SYSTEM SHALL fall back to the auto-generated API Gateway URL without error.
4. THE SYSTEM SHALL define distinct hosts for `preprod` and `production` (e.g.
   `api.preprod.<domain>` and `api.<domain>`).
5. THE SYSTEM SHALL expose the resolved API URL as an SST output so workflows and EAS profiles can
   consume it.

### Requirement 8 — Basic observability (log conventions and alerts)

**User Story:** As an on-call engineer, I want a consistent log convention and an alarm on error
spikes, so that I'm paged when a stage is unhealthy instead of finding out from users.

#### Acceptance Criteria

1. THE SYSTEM SHALL use a documented set of structured log prefixes — at minimum `[api:error]`
   for handled errors and `[api:lambda-fatal]` for errors that escape the Elysia lifecycle.
2. THE SYSTEM SHALL wrap each Lambda handler in a top-level backstop that, IF an error escapes the
   Elysia lifecycle, THEN logs a single `[api:lambda-fatal]` line (with `requestId` when
   available) and returns a generic `500` rather than an unstructured stack.
3. THE SYSTEM SHALL define, for `preprod` and `production`, a CloudWatch metric filter on the
   `[api:lambda-fatal]` (and/or `[api:error] … → 5xx`) log pattern and a CloudWatch alarm that
   fires when fatal/5xx counts exceed a threshold over a short window.
4. WHILE the stage is a non-production stage THE SYSTEM SHALL be permitted to skip alarm creation
   (alarms are required only for `preprod` and `production`).
5. THE SYSTEM SHALL route alarm notifications to an SNS topic so an operator subscription
   (email/pager) can be attached.

### Requirement 9 — EAS build and submit pipelines

**User Story:** As a release manager, I want one-click EAS build-and-submit workflows for staging
and production, so that I can ship a TestFlight / Play internal build without running EAS from a
laptop.

#### Acceptance Criteria

1. THE SYSTEM SHALL define EAS build profiles `staging` and `production` in
   `packages/mobile/eas.json`, each binding the stage-appropriate `EXPO_PUBLIC_API_URL` and
   Supabase public configuration and using `autoIncrement` for build numbers.
2. THE SYSTEM SHALL provide a mobile build workflow (manual `workflow_dispatch` with `platform`
   and `submit` inputs) that authenticates to EAS via `EXPO_TOKEN` and runs
   `eas build --profile <staging|production> --platform <ios|android|all> --non-interactive`.
3. WHEN the workflow's `submit` input is true THE SYSTEM SHALL run `eas submit --latest
--non-interactive` for the selected platform(s), targeting **TestFlight** (iOS) and the **Play
   internal track** (Android) using the submit configuration in `eas.json`.
4. THE SYSTEM SHALL keep the EAS `staging` profile pointed at the preprod/staging API host and the
   `production` profile at the production API host, consistent with Requirement 7.
5. THE SYSTEM SHALL serialise mobile builds per platform via a concurrency group so duplicate
   builds are not triggered.
6. IF `EXPO_TOKEN` is missing THEN THE SYSTEM SHALL fail the workflow early with an actionable
   message.

### Requirement 10 — Store-submission prerequisites

**User Story:** As a release manager, I want all store-submission assets and metadata present and
checklisted in the repo, so that a first App Store / Play submission is not blocked on missing
icons, privacy disclosures, or permission strings.

#### Acceptance Criteria

1. THE SYSTEM SHALL provide the required app **icon** and **splash/adaptive** assets and wire them
   in `packages/mobile/app.config.ts` (or `app.json`).
2. THE SYSTEM SHALL declare iOS usage-description strings for the **camera** (`NSCameraUsageDescription`)
   and **photo library** (`NSPhotoLibraryUsageDescription`) and the equivalent Android
   permissions, with copy that explains receipt scanning.
3. THE SYSTEM SHALL set the iOS bundle identifier, Android package name, version, and the iOS App
   Store Connect app id / Apple team id (and Android service-account/track) needed by `eas submit`.
4. THE SYSTEM SHALL include a **privacy policy** reference and a data-collection disclosure
   (covering camera/photo data and account/email) sufficient for App Privacy and Play Data Safety.
5. THE SYSTEM SHALL maintain a store-submission readiness checklist in the repo enumerating these
   prerequisites, so a release manager can verify completeness before submitting.
