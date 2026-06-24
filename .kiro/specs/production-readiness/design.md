# Design — production-readiness

## Overview

This feature hardens Divvy Up for a first store release. It is a **BE/ops** spec delivered as one
PR and depends on features 1–8 already being in place. Nothing here re-implements product
behaviour; it **assembles the per-feature tests into enforced CI gates** and adds the operational
scaffolding the reference app `persistence-backend-sst` already has:

1. A shared, global **Elysia error handler** plugin used by both services.
2. **Coverage gates** (Vitest v8 at 90%, mobile Jest) enforced in CI.
3. A **preprod stage** and its deploy workflow, completing the `PR → preprod → production` path.
4. **Secrets** declared in `infra/secrets.ts` with fail-fast presence checks at deploy time.
5. **Per-stage custom domains** in `infra/domains/`.
6. **CloudWatch** log conventions + alarms for fatal/5xx signals.
7. **EAS** build/submit pipelines and a **store-submission** checklist + assets.

Design choices intentionally mirror the reference app so the two codebases stay operationally
consistent.

---

## Architecture

### Environments and deploy triggers

| Stage         | Trigger                                      | AWS role secret           | Custom domain (R7)      |
| ------------- | -------------------------------------------- | ------------------------- | ----------------------- |
| `pr-{number}` | `ready-for-test` label (existing)            | `AWS_ROLE_ARN_PR`         | none (auto Gateway URL) |
| `preprod`     | push/merge to `main` (skips release commits) | `AWS_ROLE_ARN_PREPROD`    | `api.preprod.<domain>`  |
| `production`  | Release Please **release published**         | `AWS_ROLE_ARN_PRODUCTION` | `api.<domain>`          |

Mobile (EAS) builds are triggered manually (`workflow_dispatch`) per environment; the `staging`
EAS profile targets the preprod API host and the `production` profile targets the production host.

> Note on naming: the repo's existing workflow is `staging-deploy.yml` deploying stage `staging`.
> Per `docs/next-steps-deployments.md`, the canonical pre-production stage name is **`preprod`**.
> This spec adds a `preprod` stage + workflow; the EAS _build profile_ keeps the conventional name
> `staging` (it is the non-production profile and points at the preprod host). Where the existing
> `staging` stage and `preprod` stage would overlap, `preprod` is the source of truth and the
> `staging` workflow is renamed/retargeted to `preprod` rather than run in parallel.

### Release pipeline (incl. mobile EAS)

```mermaid
flowchart TD
  subgraph Dev
    PR[Pull Request] -->|PR checks: typecheck/lint/prettier/build/coverage| PRok{green?}
    PRok -->|label ready-for-test| PRENV[Deploy pr-N env]
    PRok -->|merge| MAIN[main]
  end

  subgraph Backend
    MAIN -->|push to main, non-release commit| PREPROD[preprod deploy<br/>sst deploy --stage preprod]
    MAIN --> RP[Release Please opens/updates release PR]
    RP -->|release PR merged + release published| PROD[production deploy<br/>sst deploy --stage production]
    PREPROD -.-> ALARMS1[CloudWatch alarms: preprod]
    PROD -.-> ALARMS2[CloudWatch alarms: production]
  end

  subgraph Mobile
    DISPATCH[workflow_dispatch] --> EASB[eas build --profile staging|production]
    EASB -->|submit=true| EASS[eas submit --latest]
    EASS --> TF[TestFlight iOS]
    EASS --> PLAY[Play internal track]
  end

  PREPROD -. EXPO_PUBLIC_API_URL .-> EASB
  PROD -. EXPO_PUBLIC_API_URL .-> EASB
```

Gating invariants:

- Coverage gates (R4) run on PR checks, preprod, and production — no environment updates without
  green coverage.
- Secret presence checks (R6) run **before** `sst deploy` on every stage.
- `production` only deploys from a published release (R5.6).

---

## Components & Interfaces

### A. Error handler module (R1, R2, R3)

New shared module per service: `microservices/<service>/src/shared/errorHandler.ts`, plus a
typed `AppError` in `microservices/<service>/src/shared/AppError.ts`. (Logic is identical across
services; if/when a `packages/api-utils` home is preferred it can be promoted there, but per the
reference each service owns its handler plugin so the Elysia plugin `name` stays unique.)

Exported Elysia plugin:

```ts
// errorHandler.ts (shape, not full impl)
export const coreErrorHandler = new Elysia({
  name: "core-error-handler",
}).onError({ as: "global" }, ({ code, error, set, request }) => {
  const requestId = request.headers.get("x-amz-request-id") ?? undefined;
  const isProd = process.env.SST_STAGE === "production";
  const status = mapStatus(code, error); // see Data Models
  set.status = status;
  logError(request, status, { code, error, requestId }); // [api:error] …
  return buildBody({ code, error, status, requestId, isProd });
});
```

Wiring — both services register the plugin **first** in the app chain:

```ts
// microservices/core/src/api.ts
const app = new Elysia()
  .use(coreErrorHandler) // global onError, registered first
  .use(openapi())
  .use(groupsListHandler);
// …existing handlers unchanged
```

`other-service` gets an analogous `receiptErrorHandler` (unique plugin `name`).

`AppError` lets services raise typed, status-bearing errors:

```ts
export class AppError extends Error {
  constructor(
    readonly code: string, // e.g. "NOT_FOUND", "FORBIDDEN"
    readonly status: number, // HTTP status
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
  }
}
```

### B. Lambda backstop (R8.2)

Each service's `src/api.ts` wraps the Hono/Lambda handler invocation in a top-level `try/catch`.
If an error escapes Elysia (e.g. a JWKS fetch failure thrown inside `.derive()`), it logs one
`[api:lambda-fatal]` line and returns a generic structured `500`. This is the only place a
non-Elysia error can be shaped.

### C. CI workflows (R4, R5, R6, R9)

| Workflow                | New / changed | Purpose                                                                               |
| ----------------------- | ------------- | ------------------------------------------------------------------------------------- |
| `pr-checks.yml`         | changed       | Coverage thresholds now enforced (job already runs `test:unit`); add mobile Jest job  |
| `preprod-deploy.yml`    | **new**       | On push to `main` (non-release): gates → secret checks → `sst deploy --stage preprod` |
| `production-deploy.yml` | changed       | Add secret-presence checks + `sst secret set` before deploy                           |
| `mobile-build.yml`      | **new**       | `workflow_dispatch` EAS build + optional submit, profile per input                    |
| `release-please.yml`    | unchanged     | Still opens release PRs / publishes releases                                          |
| `staging-deploy.yml`    | retargeted    | Renamed to preprod (see Architecture note) or removed if superseded                   |

All workflows reuse the existing `./.github/actions/setup` composite (Bun 1.3.9 + cache) and the
existing concurrency / `sst unlock` conventions.

### D. Infra modules (R6, R7, R8)

- `infra/secrets.ts` (**new**) — `sst.Secret` declarations.
- `infra/domains/index.ts` (**new**) — pure `stage → { apiHost, zoneId }` map + helper; consumed
  by `infra/api.ts` to attach domains conditionally.
- `infra/api.ts` (**changed**) — attach domain to `coreAPI` when configured; inject secret values
  into both routes' Lambda `environment`.
- `infra/observability.ts` (**new**) — CloudWatch log metric filters + alarms + SNS topic, created
  only for `preprod`/`production`.
- `sst.config.ts` (**changed**) — import the new infra modules; export resolved API URLs.

### E. Mobile release (R9, R10)

- `packages/mobile/eas.json` (**new**) — `staging` / `production` build profiles + submit config.
- `packages/mobile/app.config.ts` (**changed**) — icons, splash, permission strings, bundle ids,
  version.
- `packages/mobile/jest.config.*` (**changed**) — coverage thresholds.
- `docs/store-submission-checklist.md` (**new**) — the R10 checklist.

---

## Data Models

### Error response shape (R1, R3)

```jsonc
{
  "code": "NOT_FOUND", // string: Elysia code or AppError.code
  "error": "Not Found", // short human label
  "detail": "Group abc not found", // message; generic for 5xx in prod (R3.3)
  "validation": [
    /* … */
  ], // present only for 422 (R1.3)
  "requestId": "8f3c-…", // present only when x-amz-request-id seen (R2)
  "stack": "Error: …\n at …", // present only on non-production stages (R3.1/3.2)
}
```

Status mapping (`mapStatus`), matching the reference:

| Input `code` / error              | HTTP status |
| --------------------------------- | ----------- |
| `VALIDATION`                      | 422         |
| `NOT_FOUND`                       | 404         |
| `PARSE`                           | 400         |
| `AppError` with explicit `status` | that status |
| anything else / unknown           | 500         |

Lambda backstop body (R8.2):

```jsonc
{
  "code": "FATAL",
  "error": "Internal server error",
  "detail": "An internal error occurred. See server logs for details.",
  "requestId": "8f3c-…",
}
```

### Environment / secret matrix

| Concern                                | `pr-{number}`          | `preprod`                        | `production`                     |
| -------------------------------------- | ---------------------- | -------------------------------- | -------------------------------- |
| AWS role secret                        | `AWS_ROLE_ARN_PR`      | `AWS_ROLE_ARN_PREPROD`           | `AWS_ROLE_ARN_PRODUCTION`        |
| Deploy trigger                         | `ready-for-test` label | push to `main` (non-release)     | release published                |
| API custom domain                      | none (auto URL)        | `api.preprod.<domain>`           | `api.<domain>`                   |
| `SST_STAGE` value                      | `pr-N`                 | `preprod`                        | `production`                     |
| Stack traces in body                   | yes                    | yes                              | **no** (R3)                      |
| CloudWatch alarms                      | no                     | yes                              | yes                              |
| `DivvyUpDatabaseUrl`                   | sandbox DB             | preprod DB                       | production DB                    |
| `DivvyUpSupabaseUrl`                   | dev Supabase           | preprod/shared Supabase          | production Supabase              |
| `DivvyUpSupabaseJwksUrl` (or anon key) | dev                    | preprod                          | production                       |
| EAS profile                            | n/a                    | `staging` profile → preprod host | `production` profile → prod host |

> The exact secret set is the union of what specs 2 (db) and 4 (auth) require. At minimum:
> `DivvyUpDatabaseUrl` (Postgres connection string) and the Supabase config for JWKS verification.

---

## Configuration

### GitHub secrets / variables (per `docs/next-steps-deployments.md`)

Repository or **environment** secrets (recommend GitHub environments `preprod`, `production`):

| Name                                     | Scope         | Used by                             |
| ---------------------------------------- | ------------- | ----------------------------------- |
| `AWS_ROLE_ARN_PR`                        | repo          | PR env deploy/destroy (existing)    |
| `AWS_ROLE_ARN_PREPROD`                   | preprod env   | preprod deploy (new)                |
| `AWS_ROLE_ARN_PRODUCTION`                | production    | production deploy (existing)        |
| `DATABASE_URL`                           | per env       | `sst secret set DivvyUpDatabaseUrl` |
| `SUPABASE_URL` / `…_JWKS_URL` / anon key | per env       | Supabase config secrets             |
| `EXPO_TOKEN`                             | repo / mobile | EAS auth in `mobile-build.yml`      |
| `RELEASE_PLEASE_TOKEN`                   | repo          | release-please (existing, optional) |

Variables: `AWS_REGION` (defaults to `eu-west-2` if unset, matching existing workflows).

### AWS OIDC roles per environment (summary)

Per `docs/next-steps-deployments.md §2`:

- One **OIDC identity provider** per AWS account: provider URL
  `https://token.actions.githubusercontent.com`, audience `sts.amazonaws.com`.
- One IAM role per environment (`github-actions-pr` / `-preprod` / `-production`) with a trust
  policy scoped to `repo:<ORG>/<REPO>:*`. **Tighten** the production role's `sub` to
  `ref:refs/heads/main` or the `production` GitHub environment.
- Role permissions cover what SST deploys (CloudFormation, Lambda, API Gateway, S3, Route53/ACM
  for custom domains, CloudWatch/SNS for alarms, IAM for Lambda roles). Start broad, narrow later.
- Workflows assume the role via `aws-actions/configure-aws-credentials@v4` with `role-to-assume`
  set to the env's `AWS_ROLE_ARN_*`; no long-lived keys.

### Custom domains

`infra/domains/index.ts` holds the `stage → { apiHost, zoneId }` map. `preprod` and `production`
have hosts + hosted-zone ids; all other stages resolve to `null`/`undefined` and `infra/api.ts`
falls back to the auto Gateway URL (R7.3).

---

## Error Handling

- **Handled errors** flow through the global `onError` plugin → consistent body + `[api:error]`
  log line with `requestId`.
- **Validation** (422) keeps Elysia's `validation` detail; **4xx** keep human `detail` on all
  stages; **5xx in production** get a generic `detail` and no `stack` (R3).
- **Escaped errors** hit the Lambda backstop → `[api:lambda-fatal]` + generic 500 (R8.2).
- **Deploy-time** errors: missing secret → workflow fails before `sst deploy` with a message
  naming the secret and where to set it (R6.2). Missing `EXPO_TOKEN` → mobile workflow fails early
  (R9.6).
- **Runtime alerting**: CloudWatch metric filters on `[api:lambda-fatal]` / `5xx` drive an alarm →
  SNS → operator subscription (R8.3–8.5).

---

## Testing Strategy

This spec **enforces** existing tests rather than adding feature tests; the new code (error
handler, infra, workflows) does get its own tests.

- **Error handler unit tests** (Vitest, per service, in `src/shared/__tests__/`):
  - validation → 422 with `validation` present;
  - not-found → 404; parse → 400; unknown → 500;
  - `AppError` → its explicit status/code;
  - `requestId` present when `x-amz-request-id` header set, omitted otherwise;
  - production stage (`SST_STAGE=production`) → no `stack`, generic 5xx `detail`; 4xx `detail`
    preserved; non-prod stage → `stack` present.
- **Coverage gates**: raise Vitest thresholds to 90% (lines/functions/branches/statements) in
  `microservices/core`, `microservices/other-service`, and shared packages; configure mobile Jest
  `coverageThreshold`. CI `test:unit` (and the new mobile job) fail when unmet. Existing
  per-feature tests are what satisfy the bar; gaps surfaced by the gate are filled in the owning
  area, not papered over by lowering the threshold (R4.5).
- **Workflow validation**: `preprod-deploy.yml` and `mobile-build.yml` pass `prettier --check` and
  a YAML/`actionlint`-style sanity check; secret-presence steps are unit-verifiable via shell
  (`[ -z "$X" ] && exit 1`).
- **Infra**: `infra/domains` stage→config mapping is a pure function and gets a small unit test
  (correct host/zone for `preprod`/`production`, `null` otherwise). SST resources are validated by
  a successful `sst deploy` to `preprod` (the workflow itself is the integration test).
- **Manual store-submission verification**: the R10 checklist is walked before the first submit;
  an EAS `staging` build installed via TestFlight / Play internal track is the acceptance test for
  the mobile pipeline.
