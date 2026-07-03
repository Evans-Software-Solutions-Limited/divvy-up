# Claude on Amazon Bedrock provisioning

`POST /receipts/extract` uses a single Claude vision call
(`anthropic.claude-opus-4-8`, via Claude in Amazon Bedrock) to turn a photo
of a receipt into structured, bill-splitting-ready data — merchant, line
items, tax/tip/total, all money in integer pence. `POST
/receipts/upload-url` hands the client a presigned S3 PUT URL so it can
upload the photo directly, without routing image bytes through this
service. Everything compiles, typechecks, and unit-tests green with no live
AWS credentials — this doc is the "turn it on for real" checklist for Brad.

## What changed

The vision call now goes through **Claude in Amazon Bedrock** — the
Messages-API "Mantle" endpoint (`bedrock-mantle.{region}.api.aws`) — instead
of the direct Anthropic API. Auth is the **Lambda's execution role via
SigV4**, resolved through the default AWS credential chain. There is:

- no API key to create or rotate,
- nothing to provision in an Anthropic console, and
- no `sst secret set` step.

`AnthropicVisionAdapter` constructs an `AnthropicBedrockMantle` client
lazily (same lazy-singleton pattern as before), reading the region from the
Lambda's own `AWS_REGION` environment variable. Credentials are never
handled by application code.

## 1. Prerequisite: enable Bedrock model access

Amazon Bedrock requires **model access** for Anthropic models to be
explicitly enabled in the AWS account's Bedrock console, per account, before
any request will succeed. Brad has already enabled this in `ess-dev`. If
you're setting up a new AWS account/stage:

1. Go to the Bedrock console in the target region → **Model access**.
2. Request/enable access to Anthropic models.
3. Access is typically granted instantly for Anthropic models — no waiting
   period, open to all Bedrock customers.

Model used: `anthropic.claude-opus-4-8`.

## 2. Endpoint and region

The Lambda calls the **global** Bedrock endpoint, derived from its own
`AWS_REGION` (eu-west-2 is supported). Global routing has **no pricing
premium** over first-party API pricing. Forcing EU-only regional routing
(for data residency) is possible on Bedrock but carries a **+10% price
premium** — this is not enabled here; revisit only if there's a compliance
requirement for it.

## 3. IAM

The Lambda's execution role is granted `bedrock-mantle:CreateInference` in
`infra/api.ts`, on the `receiptServiceAPI` route's `permissions` block.
Nothing manual to provision — this is deployed automatically with the
stack.

## 4. What happens before model access is enabled

If Bedrock model access isn't yet enabled for the account/region, or the
Lambda's role is missing the permission, `POST /receipts/extract` fails
cleanly: the `AnthropicVisionAdapter`'s error mapping catches the failure
(an `Anthropic.APIError`, or — as a dual-package-instance guard — a plain
object carrying an HTTP `status`) and surfaces it to the client as a **502**
with `code: "upstream_error"` (a permission-denied response from Bedrock
maps the same way). Never a raw 500. `POST /receipts/upload-url` is
unaffected by any of this — it only touches S3.

## 5. Cost per month & how to subsidise it

Pricing on the Bedrock global endpoint carries the same sticker price as
first-party: **Opus 4.8 is $5 per million input tokens / $25 per million
output tokens.**

**Per scan:** a receipt photo is roughly 1.5k–5k image tokens (depending on
resolution) plus about 0.7k prompt tokens in; the JSON output, `rawText`,
and a little adaptive thinking come to roughly 0.5k–1.5k tokens out. That
works out to **roughly $0.02–0.06 (2–5p) per scan**.

**Monthly scenarios:**

| Usage                             | Estimated cost |
| --------------------------------- | -------------- |
| Personal use (~50 scans/month)    | ~£1–2/month    |
| 20 active users × 8 receipts each | ~£5/month      |
| 200 users                         | ~£50/month     |
| 1,000 users × 10 receipts each    | ~£300/month    |

Fixed infra (S3 + Lambda + API Gateway) is pennies at these volumes — the
model call is effectively the only marginal cost.

**Subsidy levers, in order of increasing effort:**

1. **Model tier.** Haiku 4.5 ($1/$5 per million tokens) is roughly 5x
   cheaper (~0.5–1p/scan); Sonnet 5 ($3/$15, with an introductory $2/$10
   rate through 2026-08-31) is roughly 40–60% cheaper. The model is a
   single string literal in `anthropicVision.ts` — trivial to change — but
   benchmark extraction accuracy on real receipts before switching down a
   tier.
2. **Client-side image downscaling** before upload. A receipt is legible at
   roughly 1568px on the long edge; full-resolution phone photos can cost
   up to ~3x more in image tokens for no accuracy benefit.
3. **A free monthly quota per user** (e.g. 10 scans, then manual entry).
   Needs the auth phase to identify individual users — a future step, not
   available yet.
4. **Paid-tier gating.** Extraction is the only feature with real marginal
   cost, so it's the natural premium boundary if the app ever introduces
   paid tiers.
5. **An AWS Budgets alert** on the account (e.g. a £10/month threshold) so
   cost growth is visible before it becomes a problem.

## 6. Manual end-to-end verification (needs a deployed stack)

Once the stack is deployed and Bedrock model access is enabled:

```sh
# 1. Ask for a presigned upload URL
curl -X POST https://<receipt-service-url>/receipts/upload-url \
  -H "Content-Type: application/json" \
  -d '{"contentType": "image/jpeg"}'
# => { "key": "receipts/<uuid>.jpg", "uploadUrl": "https://...", "expiresIn": 300 }

# 2. PUT the actual photo bytes to the presigned URL — Content-Type MUST
#    match what you requested in step 1, or S3 rejects the PUT.
curl -X PUT "<uploadUrl from step 1>" \
  -H "Content-Type: image/jpeg" \
  --data-binary @/path/to/receipt-photo.jpg

# 3. Extract structured data from the uploaded image
curl -X POST https://<receipt-service-url>/receipts/extract \
  -H "Content-Type: application/json" \
  -d '{"imageKey": "receipts/<uuid>.jpg"}'
```

Inspect the response: check `items` against the photo (descriptions, unit
prices, quantities), and check `warnings` — if line items don't sum to
`subtotal`, or `subtotal + tax + tip` doesn't equal `total`, a warning
string names both numbers. Warnings are informational, not errors; a 200
with warnings is a successful extraction that wants a human glance.

## 7. Timeouts — know the ceiling

- API Gateway v2 hard-caps any integration response at **30 seconds** — this
  is a wall you cannot configure around.
- The Lambda function's own timeout is set to **29 seconds** in
  `infra/api.ts`, one second under that wall, so the Lambda times out and
  returns a clean error before API Gateway kills the connection outright.
- The Bedrock client inside `AnthropicVisionAdapter` is constructed with
  `timeout: 25_000` (25s) and `maxRetries: 0`. Zero retries is deliberate:
  the SDK's default of 2 retries could easily blow past the 29s Lambda
  timeout on its own, and retry ownership belongs to the calling client
  (the mobile app), which can retry a failed `/receipts/extract` call with
  full context (e.g. showing the user a "retrying..." spinner) that this
  service doesn't have.

## What's NOT validated by this PR's gates

- A real call to Claude on Bedrock (needs a deployed stack with Bedrock
  model access enabled — there is no credential to fake locally since auth
  is IAM-role-based).
- A real S3 PUT/GET round trip (needs a deployed bucket — `test:unit` runs
  with zero AWS credentials by design, per adapter tests using fakes/mocks).
- Actual extraction accuracy on real-world receipt photos (skewed angles,
  handwritten tips, faded thermal paper) — only verifiable by trying real
  photos per step 6 above.
