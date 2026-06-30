# Tasks — production-readiness

> One shippable PR (feature #9), depends on features 1–8. This spec **enforces existing tests as
> gates** and adds ops scaffolding; it does not re-implement product features. Each task builds on
> the previous and references the requirements it satisfies.

- [ ] 1. Add a typed domain error and the shared error-handler plugin to `core`
  - Create `microservices/core/src/shared/AppError.ts` (`code`, `status`, `message`, optional
    `cause`).
  - Create `microservices/core/src/shared/errorHandler.ts` exporting `coreErrorHandler`
    (`new Elysia({ name: "core-error-handler" }).onError({ as: "global" }, …)`): build the
    `{ code, error, detail, validation?, requestId?, stack? }` body, `mapStatus` (VALIDATION→422,
    NOT_FOUND→404, PARSE→400, `AppError`→its status, else→500), read `requestId` from the API
    Gateway request context (`requestContext.requestId`, with the `x-amzn-trace-id` header as
    fallback — NOT a nonexistent `x-amz-request-id` header), and emit the
    `[api:error] <METHOD> <PATH> → <STATUS> · <json>` log line.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3_

- [ ] 2. Make the error handler production-safe and wire it into the `core` app
  - In `errorHandler.ts`, gate on `process.env.SST_STAGE === "production"`: omit `stack`/cause
    detail in prod, include them otherwise; replace `detail` with a generic message for 5xx in
    prod while logging full detail; preserve `detail` for 4xx on all stages.
  - Register `.use(coreErrorHandler)` **first** in `microservices/core/src/api.ts`.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 1.1_

- [ ] 3. Replicate the error handler in `other-service` and add the Lambda backstop to both
  - Add `receiptErrorHandler` (unique plugin `name`) to `microservices/other-service` mirroring
    tasks 1–2, registered first in its `api.ts`.
  - Wrap the Hono/Lambda handler call in each service's `src/api.ts` in a top-level `try/catch`
    that logs `[api:lambda-fatal]` (with `requestId` when present) and returns the generic 500
    body.
  - _Requirements: 1.1, 8.1, 8.2_

- [ ] 4. Unit-test the error handlers
  - Add `src/shared/__tests__/errorHandler.test.ts` in both services covering: 422/404/400/500
    mapping; `AppError` status passthrough; `requestId` present-vs-absent; prod stage hides
    `stack` and genericises 5xx `detail` while keeping 4xx `detail`; non-prod includes `stack`.
  - _Requirements: 1.2, 1.3, 1.4, 2.1, 2.2, 3.1, 3.2, 3.3, 3.4_

- [ ] 5. Enable Vitest v8 coverage thresholds at 90% and enforce in PR checks
  - Raise `thresholds` to `{ lines: 90, functions: 90, branches: 90, statements: 90 }` in
    `microservices/core/vitest.config.ts`, `microservices/other-service/vitest.config.ts`, and the
    shared packages that ship logic (`packages/split-engine`, `packages/api-utils`, `packages/db`);
    keep `provider: "v8"` and the entrypoint `exclude` list (`src/api.ts`, `src/index.ts`).
  - Confirm `pr-checks.yml` (and `staging-deploy.yml`/`production-deploy.yml`) `test:unit` step
    fails on threshold miss; fill any coverage gaps in the owning area rather than lowering the bar.
  - _Requirements: 4.1, 4.2, 4.4, 4.5_

- [ ] 6. Add mobile Jest coverage thresholds and a CI job
  - Set `coverageThreshold` in `packages/mobile`'s Jest config and add a `test:unit` script that
    runs Jest with `--coverage`.
  - Add a mobile unit-test job to `pr-checks.yml` (and the deploy workflows) that runs it as a gate.
  - _Requirements: 4.3, 4.4_

- [ ] 7. Declare secrets in `infra/secrets.ts` and inject them into both Lambdas
  - Create `infra/secrets.ts` with `sst.Secret` declarations (at minimum `DivvyUpDatabaseUrl` and
    the Supabase config secrets needed for JWKS verification).
  - In `infra/api.ts`, inject the secret `.value`s into the `environment` of both
    `coreAPI`/`receiptServiceAPI` routes; never commit secret values.
  - _Requirements: 6.1, 6.4, 6.5_

- [ ] 8. Add a `preprod` deploy workflow with fail-fast secret checks
  - Create `.github/workflows/preprod-deploy.yml`: trigger on push to `main` (skip Release Please
    commits), concurrency group `sst-preprod`, OIDC via `AWS_ROLE_ARN_PREPROD`; steps =
    typecheck → lint → prettier → build → `test:unit` (coverage gates) → secret presence checks →
    `sst secret set … --stage preprod` → `sst unlock` → `sst deploy --stage preprod`.
  - Each secret check: `[ -z "$X" ] && echo "::error::… set it under Settings → Environments →
preprod → Secrets" && exit 1`, run **before** deploy.
  - Retarget/rename the existing `staging-deploy.yml` to `preprod` (or remove if superseded) so the
    two stages don't run in parallel.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.2, 6.3, 4.4_

- [ ] 9. Add the same fail-fast secret checks to the production deploy
  - In `production-deploy.yml`, add the secret-presence checks and `sst secret set … --stage
production` before `sst deploy`; keep the trigger on `release: published` so the promotion path
    stays `PR → preprod → production`.
  - _Requirements: 5.6, 6.2, 6.3_

- [ ] 10. Add per-stage custom domains under `infra/domains/`
  - Create `infra/domains/index.ts` with a pure `stage → { apiHost, zoneId }` map (hosts/zone ids
    for `preprod` and `production`; `null` otherwise) and a small unit test for the mapping.
  - In `infra/api.ts`, attach the domain to `coreAPI` when configured (with the hosted-zone DNS);
    fall back to the auto Gateway URL when not. Export the resolved API URL from `sst.config.ts`.
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 11. Add CloudWatch alarms and SNS for fatal/5xx signals
  - Create `infra/observability.ts`: for `preprod`/`production` only, create a log metric filter on
    `[api:lambda-fatal]` (and/or `[api:error] … → 5xx`), a CloudWatch alarm on the count over a
    short window, and an SNS topic for notifications; import it from `sst.config.ts`.
  - _Requirements: 8.1, 8.3, 8.4, 8.5_

- [ ] 12. Add EAS build profiles and the build/submit workflow
  - Create `packages/mobile/eas.json` with `staging` and `production` build profiles (each binding
    `EXPO_PUBLIC_API_URL` to the preprod/prod API host, Supabase public config, `autoIncrement`)
    plus the iOS/Android `submit` config (App Store Connect app id, Apple team id; Android
    service-account/track).
  - Create `.github/workflows/mobile-build.yml`: `workflow_dispatch` with `platform` and `submit`
    inputs, fail early if `EXPO_TOKEN` missing, concurrency per platform, auth via
    `expo/expo-github-action` + `EXPO_TOKEN`, run `eas build --profile <input> --platform <input>
--non-interactive` and, when `submit` is true, `eas submit --latest --non-interactive` to
    TestFlight / Play internal track.
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [ ] 13. Add store-submission assets, metadata, and the readiness checklist
  - Add app icon + splash/adaptive assets and wire them, bundle id/package, version, and the App
    Store Connect app id / Apple team id in `packages/mobile/app.config.ts`. **Verify** the
    camera + photo usage-description / permission strings are present (they are introduced by
    feature #6 when the camera/photo APIs ship — this task audits them for store submission, not
    re-adds them).
  - Add a privacy-policy reference + data-collection disclosure (App Privacy / Play Data Safety).
  - Create `docs/store-submission-checklist.md` enumerating all R10 prerequisites for a release
    manager to verify before submitting.
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
