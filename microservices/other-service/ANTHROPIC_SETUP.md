# Anthropic API provisioning

`POST /receipts/extract` uses a single Claude vision call (`claude-opus-4-8`)
to turn a photo of a receipt into structured, bill-splitting-ready data —
merchant, line items, tax/tip/total, all money in integer pence. `POST
/receipts/upload-url` hands the client a presigned S3 PUT URL so it can
upload the photo directly, without routing image bytes through this
service. Everything compiles, typechecks, and unit-tests green with no live
Anthropic key or AWS credentials — this doc is the "turn it on for real"
checklist for Brad.

## 1. Create the Anthropic API key

1. Go to [console.anthropic.com](https://console.anthropic.com), select the
   Divvy Up org/workspace (or create one), and create an API key under
   **Settings → API Keys**.
2. Keep it somewhere safe (password manager) — it won't be shown again.

## 2. Provision the SST secret

`infra/api.ts` declares `AnthropicApiKey` as an `sst.Secret` with a
placeholder default (`"placeholder"`), so deploys and `sst dev` work before
this step. Set the real value per stage:

```
sst secret set AnthropicApiKey sk-ant-... --stage dev
sst secret set AnthropicApiKey sk-ant-... --stage production
```

Run this from the repo root. Each stage needs its own `secret set` — there's
no inheritance from `dev` to `production`.

## 3. What the placeholder means until you do step 2

With the placeholder value, the service deploys fine and `POST
/receipts/extract` is reachable, but any real call to Claude will fail
authentication. That failure is caught by the `AnthropicVisionAdapter`'s
error mapping (an `Anthropic.APIError` that isn't a `RateLimitError` or
`APIConnectionError`) and surfaces to the client as a `502` with `code:
"upstream_error"` — not a crash, not a 500, just "extraction didn't work."
`POST /receipts/upload-url` is unaffected by this secret — it only touches
S3.

## 4. Cost expectation

Opus 4.8 pricing is $5 per million input tokens and $25 per million output
tokens. A receipt photo is roughly 1.5k–5k image tokens (depending on
resolution) plus a small structured-output response (the JSON schema keeps
output compact). Expect **roughly $0.01–$0.05 per scan**. This is
per-extraction, not per-upload — `upload-url` doesn't call Anthropic at all.

## 5. Manual end-to-end verification (needs a deployed stack)

Once the stack is deployed and the secret is set:

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

## 6. Timeouts — know the ceiling

- API Gateway v2 hard-caps any integration response at **30 seconds** — this
  is a wall you cannot configure around.
- The Lambda function's own timeout is set to **29 seconds** in
  `infra/api.ts`, one second under that wall, so the Lambda times out and
  returns a clean error before API Gateway kills the connection outright.
- The Anthropic client inside `AnthropicVisionAdapter` is constructed with
  `timeout: 25_000` (25s) and `maxRetries: 0`. Zero retries is deliberate:
  the SDK's default of 2 retries could easily blow past the 29s Lambda
  timeout on its own, and retry ownership belongs to the calling client
  (the mobile app), which can retry a failed `/receipts/extract` call with
  full context (e.g. showing the user a "retrying..." spinner) that this
  service doesn't have.

## What's NOT validated by this PR's gates

- A real call to Claude vision (needs the real API key from step 2).
- A real S3 PUT/GET round trip (needs a deployed bucket — `test:unit` runs
  with zero AWS credentials by design, per adapter tests using fakes/mocks).
- Actual extraction accuracy on real-world receipt photos (skewed angles,
  handwritten tips, faded thermal paper) — only verifiable by trying real
  photos per step 5 above.
