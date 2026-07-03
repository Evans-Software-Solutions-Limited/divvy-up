# Next Phase Brief — Implement real receipt extraction (`/receipts/extract`)

> **For a fresh session/agent (Fable).** This is a self-contained handoff — read it
> top to bottom; you should not need prior conversation context. Where this brief
> says "investigate" or "decide," that decision is deliberately left to you — do
> not assume the answer from training data. This space (vision-LLM structured
> extraction, current model pricing/capability) moves fast; **verify against
> current docs/benchmarks before committing to an approach**, the same way the
> PowerSync integration phase verified SDK names against live docs instead of
> memory (see `docs/next-phase-brief-powersync.md` for that precedent, now
> merged, if you want to see the standard this repo holds itself to).

---

## 1. What Divvy Up is

A **mobile-first bill-splitting app**: snap a receipt → AI extracts line items →
assign items to people (one / equal split / everyone / custom weights) → finalize
→ see who owes whom → settle up (V1 records payments; no real money movement).
Money is **always integer pence/cents (minor currency units) end to end, never
floats.** Personal-use, low write-concurrency, low volume — this is not a
high-throughput system, and your design decisions should not over-engineer for
scale it will never see.

## 2. Your job this phase

**`POST /receipts/extract` currently returns hardcoded mock data.** Your job is to
make it actually extract structured data from a real photographed receipt, using
whatever extraction approach you determine is genuinely best — see §5. Everything
downstream of the extraction result (assignment UI, split math, balances) already
exists and works; this phase is scoped tightly to **the extraction step itself**
plus the infrastructure it needs to run for real (image storage, secrets).

### Your two acceptable deliverables — pick based on your own judgment

1. **A complete, working, tested implementation**, if you judge you can deliver
   one in this session without cutting corners. Gates green, real tests (mocking
   the vision API call, not the whole feature), manual-verification instructions
   for the parts that need a live API key/deployed stack to actually prove.
2. **A complete specification**, if you judge the work doesn't fit in one
   session. This must be a genuinely actionable plan a future session (human or
   agent) could implement from without re-doing your investigation — the
   extraction approach decided (with reasoning), the exact API/SDK/model version
   pinned, the S3/secrets architecture designed, error-handling and confidence
   policy specified, and a concrete task breakdown.

**Do not ship a partial implementation that looks done but isn't** (e.g. real
extraction code with no real error handling, or wired up but never actually
tested against a real image). If you can't finish properly, spec it properly
instead — a half-finished implementation is worse than either full deliverable.

## 3. What's already decided (do not re-litigate)

- **Extraction approach itself is your call — see §5.** Nothing below overrides
  that.
- **Database stays Postgres/Supabase. Do not consider DynamoDB or any other
  store.** The mobile app's entire local-first sync layer (`packages/mobile`,
  merged) is built on PowerSync, which only supports Postgres, MySQL, MongoDB,
  SQL Server, or Convex as a source database — **not DynamoDB**. This was
  investigated and closed off already; don't reopen it.
- **Backend architecture stays as-is: AWS Lambda (via SST v3), Elysia, hexagonal
  ports/adapters.** You're implementing _inside_ this pattern, not replacing it.
  See §6 for the exact existing files to follow.
- **Frontend is out of scope. `packages/web` is the UX source of truth** for
  what the receipt-scan flow should eventually look like end-to-end, but you are
  not redesigning or reimplementing it. See §7 for the honest current state of
  the frontend (it doesn't call this endpoint yet at all — that's a known gap,
  not something to silently paper over, but wiring the client is optional
  stretch work, not your primary deliverable).
- **`microservices/core`'s persistence is separately-known tech debt (in-memory
  `Map`s, not wired to `packages/db`'s Postgres schema despite that schema
  existing).** Not your problem this phase. `/receipts/extract` returns its
  result to the caller, which is responsible for a subsequent `POST /expenses` —
  it does not, and should not, write to any database itself.

## 4. What's already done (do not redo)

- **`packages/db`** (merged): Postgres schema via Drizzle. Relevant tables:
  `expenses` (has `receipt_image_key`, nullable — the S3 key), `receipt_items`
  (has `unit_price` integer pence, `confidence` real 0..1 nullable, `flag` text
  nullable — both currently unused by anything, ready for you to populate
  semantics for). See `packages/db/src/schema.ts`.
- **`microservices/other-service`** (exists, mocked): the receipt-service Lambda.
  - `src/types/receipt.ts` — `OcrExtractResult` / `ExtractedItem` types. Amounts
    are typed `number` in minor units; the file comment says "cents" but the
    rest of the app's convention (and DB default currency) is GBP/pence — reconcile
    this naming when you touch it, and make sure whatever you return is
    validated as an **integer**, not just typed as `number` (an LLM or float
    OCR result could hand you `62.00` or a non-integer; catch that before it
    reaches the client).
  - `src/application/repositories/receiptExtractRepository.ts` — the mock you're
    replacing. `ReceiptExtractRepository.extract(imageKey, groupId)`.
  - `src/application/receipt/extract/receiptExtractService.ts` — Elysia DI
    wiring (decorates the repository onto the app). Follow this exact pattern
    for any new adapter you add (e.g. an S3 client, a vision-API client) —
    that's the hexagonal seam in this codebase.
  - `src/application/receipt/extract/receiptExtractHandler.ts` — the Elysia
    route + request/response schema (`t.Object(...)`). Mirrors `OcrExtractResult`
    by hand; keep both in sync if you change the shape.
  - `src/application/receipt/extract/__tests__/receiptExtractHandler.test.ts` —
    existing test, currently tests against the mock. Update as needed; keep the
    hexagonal seam (mock the repository/adapter, not the HTTP layer) as the
    testing pattern.
  - `src/api.ts` — Lambda entry point (`hono/aws-lambda` wrapping the Elysia
    app). Deployed via `infra/api.ts`'s `receiptServiceAPI` (SST
    `ApiGatewayV2` → this Lambda). No JWT authorizer wired yet (there's a
    `// TODO` in `infra/api.ts`) — not your job to add auth this phase.
- **Web prototype** (`packages/web/src/pages/ReceiptReview.tsx`): the item
  editor UI (assignment modes, live split bar) that will eventually consume your
  extraction result. Read it to understand the shape of data the product
  actually wants surfaced (e.g. does the UI have anywhere to show a
  low-confidence flag?) — but do not modify it.

## 5. The decision that's genuinely yours: how should extraction work?

Investigate and decide. Two starting reference points (verify freshness — these
were found via search, not guaranteed current):

- [Vellum — Document Data Extraction in 2026: LLMs vs OCRs](https://www.vellum.ai/blog/document-data-extraction-llms-vs-ocrs)
- [Parsli — LLM OCR vs Traditional OCR, 2026 benchmark](https://parsli.co/blog/llm-ocr-vs-traditional-ocr)

The shape of the tradeoff, as background (not as the answer):

- **Traditional OCR (Textract, Google Vision, etc.) → separate LLM/parser
  step.** Two hops: OCR gives you raw text (often losing layout/column
  structure), then something has to parse that text into `OcrExtractResult`.
  More moving parts, more failure points, but OCR-only cost is very low and
  well-understood at scale (irrelevant constraint here given this app's volume).
- **Vision-capable LLM, single step, forced structured output.** Photo straight
  to a JSON/tool-call matching `OcrExtractResult` in one model call. Handles
  messy real-world photos (glare, thermal-paper fade, skew, handwriting)
  better than OCR-then-parse in current benchmarks, and "get it in the right
  format" is closer to guaranteed since you're constraining the model's output
  schema directly rather than post-processing free text.
  If you go this way: this is a Claude-shaped problem (Anthropic messages API
  with an image content block + forced tool use / structured output for the
  schema) — **look up current Claude vision + tool-use / structured-output
  docs before writing code**, do not assume API shape from memory.
- **Hybrid** (OCR for raw text preserved for debugging/audit +
  vision-LLM for the actual structured parse) is also a legitimate answer if
  your investigation supports it — `OcrExtractResult.rawText` already exists in
  the type for exactly this kind of provenance/debugging use.

Whichever you choose, design in:

- **Confidence handling.** `receipt_items.confidence` and `.flag` exist in the
  DB schema for a reason — decide what populates them (e.g. per-item
  extraction confidence from the model, or a heuristic like "item price didn't
  reconcile with subtotal") and make sure your extraction result carries enough
  information for a caller to compute them.
- **Failure modes.** Blurry/unreadable image, non-receipt image, receipt in a
  language the model misreads, multi-currency edge cases, a total that doesn't
  reconcile with summed items. Decide what the API returns in each case (a
  best-effort partial result with flags vs. a typed error) — don't let any of
  these throw an unhandled 500.
- **Retry/timeout policy** for the vision API call itself (network failure,
  rate limit, timeout) — distinct from "the model successfully processed a bad
  photo," which is a data-quality problem, not a transport one.

## 6. Infrastructure you'll need to add (none of it exists yet — verified)

- **S3 bucket for receipt images.** There is currently **no S3 bucket defined
  anywhere in `infra/`** (checked `infra/api.ts`, `infra/web.ts`). `imageKey` is
  presently just a string parameter with nothing real behind it. You need to
  provision one via SST (`sst.aws.Bucket` — verify current SST v3 API/docs, this
  repo's SST config is at `sst.config.ts` / `infra/*.ts`, `home: "aws"`).
- **An actual upload path.** Nothing in `packages/web` or anywhere else
  currently uploads an image to S3 or calls `/receipts/extract` at all (checked
  — zero references). The standard pattern is a presigned-PUT-URL endpoint the
  client hits first, then uploads directly to S3, then calls `/receipts/extract`
  with the resulting key. Decide whether that's a new endpoint on the receipt
  service or elsewhere, following the existing hexagonal/Elysia pattern.
- **API key secret wiring.** No precedent exists in this repo yet for injecting
  a third-party API secret into a Lambda (checked — no `sst.Secret` usage
  anywhere). SST v3's `sst.Secret` + `Resource.<Name>.value` is the standard
  mechanism — verify against current SST docs, wire whatever key your chosen
  extraction approach needs (e.g. `ANTHROPIC_API_KEY`), and document the
  provisioning step for Brad the same way `packages/mobile/POWERSYNC_SETUP.md`
  documents PowerSync provisioning (this repo's established pattern for
  "compiles/tests green without the real secret, here's what to provision for
  it to actually work").

## 7. Frontend — current honest state (context only, not your scope)

`packages/web`'s Home page has a "scan receipt" CTA per the product description,
but **there is currently no code anywhere in `packages/web/src` that calls
`/receipts/extract` or uploads an image** (checked). The prototype is your UX
reference for what the flow _should_ look like once wired, not a working
end-to-end path today. Wiring the client to your new real endpoint is
legitimate optional stretch work if you have room after a solid backend
implementation — but a correct, well-tested backend with no client wiring is a
complete deliverable for this phase. A backend wired to a client that then
silently mishandles your response shape is not.

## 8. Repo facts / commands

- Monorepo: **Bun** workspaces + **Turbo**. Packages: `packages/{web,db,mobile,api-utils}`,
  `microservices/{core,other-service}`. Your work is in `microservices/other-service`
  plus `infra/`.
- Gates (run from repo root): `bun run typecheck`, `bun run lint`, `bun run
prettier:check` (fix with `prettier:write`), `bun run test:unit`.
  `microservices/other-service` uses **vitest**, not jest (`sst shell vitest` /
  `vitest run --coverage` per its `package.json`).
- CI = `.github/workflows/pr-checks.yml`. Note: its path-filter (`Detect
Changes` job) currently does **not** list `microservices/other-service` or
  `infra/` as a trigger path (only `packages/web`, `microservices/core`,
  `packages/api-utils`, `infra/**`, and a few root files) — check whether your
  changes to `microservices/other-service` alone would even trigger CI, and
  flag it in your PR if not (this is pre-existing gap in the workflow, not
  something introduced by you, but worth surfacing since it bit the PowerSync
  PR in reverse — see that PR's description for the story).
- Branch from `main`, open a PR, keep it green. Commit trailer:
  `Co-Authored-By: Claude Fable <noreply@anthropic.com>` (adjust if your
  environment's convention differs). PR body footer:
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Inspector Brad** review convention: after the PR is green, expect (or run
  locally) a bug-focused review pass before merge — see recent PR history for
  the pattern (PR #12, `feat/mobile-powersync`, is a good reference for the
  whole shape of a phase: brief → implementation → gates → Inspector Brad
  findings → fixes → merge).

## 9. Definition of done

**If implementing:**

- Real extraction call replaces the mock, using your investigated-and-decided
  approach, with reasoning documented (a short comment block or ADR-style note
  is enough — doesn't need a full doc).
- S3 bucket + upload path provisioned in `infra/`.
- API key secret wired via SST, with a provisioning doc (mirroring
  `POWERSYNC_SETUP.md`) for whatever Brad needs to do to make it live.
- Confidence/flag semantics decided and populated in the response shape (or a
  clear note on why not, if you decide differently).
- Error handling for bad images, transport failures, and non-reconciling totals
  — no unhandled 500s.
- Money stays integer minor units end to end — validated, not just typed.
- Real unit tests (mock the vision/OCR API boundary, not the whole repository),
  gates green.
- Clear notes on anything that can only be validated with a live API key /
  deployed stack (same spirit as the PowerSync PR's "needs a dev build" notes).

**If speccing instead:**

- The extraction approach is decided (not left open) with reasoning and current
  sources cited.
- S3/upload/secrets architecture is fully designed, not just flagged as
  needed.
- Confidence/error/retry policy is fully specified.
- A concrete, ordered task breakdown exists that a future implementation
  session could execute without redoing your investigation.

---

_Pointers: extraction contract → `microservices/other-service/src/types/receipt.ts`;
mock to replace → `microservices/other-service/src/application/repositories/receiptExtractRepository.ts`;
DB schema → `packages/db/src/schema.ts`; frontend reference (do not modify) →
`packages/web/src/pages/ReceiptReview.tsx`; infra → `infra/api.ts`,
`sst.config.ts`; prior-phase precedent for this brief's format and standards →
`docs/next-phase-brief-powersync.md`._
