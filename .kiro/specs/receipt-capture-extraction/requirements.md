# Requirements — Receipt Capture & Extraction

> Feature #6. Type: FE → BE, one shippable PR. Depends on foundations 1–4
> (`mobile-app-foundation`, `data-and-persistence`, `shared-split-engine`, `authentication`).
> Read `.kiro/steering/` first — this spec inherits that shared context.

## Introduction

This feature delivers the **capture + extract** slice of the Divvy Up hero flow:
Home → (Annotate coach) → **Camera / import → upload → AI processing** → hands off to
Review & assign. On a mobile device the user photographs a receipt (or imports one from the
photo library), the image is uploaded to S3, and a real vision/OCR step extracts structured
line items **in integer pence with a per-item confidence score (0..1)** plus an optional flag
reason, the detected merchant, and receipt-level adjustments (e.g. service charge). The result
is persisted as a **draft expense** (status `draft`) with its items and the `receipt_image_key`,
ready for feature #7 (`receipt-review-assignment`) to load.

Scope boundary: this spec **produces the extracted draft** and navigates to Review. It does
**not** build the Review & assign screen, item editor, assignment modes, the "how AI read your
receipt" overlay, finalize, or the manual add-expense path (the prototype's "Skip — I'll assign
manually" entry point) — those belong to feature #7. The manual-add path is **not yet designed**
and is flagged, not built, here.

Product principles that bind this feature (from `steering/product.md`):
**AI suggests, the user confirms** — extraction never finalizes; **no hidden math** — amounts
are exact integer pence; **degrade honestly** — low-confidence and unreadable inputs are
surfaced, never silently guessed. Currency is **GBP** for V1.

### Key terms

- **Draft expense** — an `Expense` row with `status = 'draft'`, created from an extraction so the
  user can review and assign before finalizing.
- **Per-item confidence** — a float `0..1` the model attaches to each line item; `< 0.7` is
  treated as "needs a quick check" (the amber flag threshold, matching the prototype).
- **Adjustment** — a receipt-level charge/discount (service charge, tip, tax, discount) that
  affects the total and is later apportioned pro-rata by the split engine.
- **Extraction contract** — the structured response shape (items + confidence + flag + merchant
  - adjustments, all money in pence) that feature #7 consumes. It is the load-bearing artifact
    of this spec.

---

## Requirement 1 — Capture a receipt with the camera

**User Story:** As a group member settling a shared bill, I want to photograph the receipt with
my phone camera, so that the app can read the items without me typing them.

#### Acceptance Criteria

1.1. WHEN the user taps the scan/camera action from Home or a group THE SYSTEM SHALL open a
camera capture screen with a receipt-framing viewfinder.

1.2. IF camera permission has not been granted THEN THE SYSTEM SHALL request it, and IF the user
declines THEN THE SYSTEM SHALL show an explanatory state offering "Import from library" and a
link to device settings instead of a dead end.

1.3. WHILE the camera preview is live THE SYSTEM SHALL display framing guidance ("Flatten the
receipt & fill the frame") and a capture control.

1.4. WHEN the user triggers capture THE SYSTEM SHALL acquire a still image and advance to the
upload step without requiring further input.

1.5. THE SYSTEM SHALL target a still image suitable for OCR (reasonable resolution; downscaled
client-side to a bounded max dimension and re-encoded as JPEG before upload).

1.6. WHERE the device exposes a torch/flash control THE SYSTEM SHALL let the user toggle it.

## Requirement 2 — Import a receipt from the photo library

**User Story:** As a user who already has a photo of the receipt, I want to pick it from my
photo library, so that I don't have to re-photograph it.

#### Acceptance Criteria

2.1. WHEN the user taps the library/import control on the capture screen THE SYSTEM SHALL open
the device photo picker.

2.2. IF photo-library permission is required and declined THEN THE SYSTEM SHALL show an
explanatory state and a link to device settings, not a crash or blank screen.

2.3. WHEN the user selects an image THE SYSTEM SHALL accept common image types (JPEG, PNG, HEIC)
and advance to the upload step.

2.4. IF the selected file is not a supported image or exceeds the maximum byte size THEN THE
SYSTEM SHALL reject it with a clear message and let the user pick again.

2.5. THE SYSTEM SHALL apply the same client-side downscale/re-encode as camera capture
(Requirement 1.5) so imported and captured images follow one upload path.

## Requirement 3 — Upload the image to object storage

**User Story:** As a user, I want my receipt photo uploaded securely and quickly, so that the AI
can read it and I'm not left staring at a stuck spinner.

#### Acceptance Criteria

3.1. WHEN an image is captured or imported THE SYSTEM SHALL obtain an upload target for an S3
object whose key is namespaced per authenticated user and group
(`receipts/{userId}/{groupId}/{uuid}.jpg`).

3.2. THE SYSTEM SHALL upload the image bytes to S3 over the granted upload path (a presigned PUT
URL by default, or an API-proxied upload as the fallback) and SHALL NOT embed long-lived AWS
credentials in the mobile client.

3.3. WHILE the upload is in progress THE SYSTEM SHALL show honest progress (an indeterminate or
byte-based indicator) and SHALL allow the user to cancel.

3.4. IF the upload fails (network error, timeout, or non-2xx response) THEN THE SYSTEM SHALL
surface a retry affordance and SHALL NOT proceed to extraction.

3.5. WHEN the upload completes THE SYSTEM SHALL hold the resulting `receiptImageKey` and pass it
to the extraction request; the raw image bytes SHALL NOT be sent to the extract endpoint.

3.6. THE SYSTEM SHALL scope every upload target and key to the authenticated user and a group
they belong to, rejecting requests for groups the user is not a member of.

## Requirement 4 — AI processing screen with honest progress

**User Story:** As a user, I want to see what the AI is doing while it reads my receipt, so that
I trust the result and know it hasn't stalled.

#### Acceptance Criteria

4.1. WHEN the upload completes THE SYSTEM SHALL show an "AI processing" screen and call the
extract endpoint with the `receiptImageKey` and `groupId`.

4.2. WHILE extraction is running THE SYSTEM SHALL display progress phrased around the real work
(e.g. "Reading items", "Reading prices", "Detecting merchant & charges") and SHALL NOT claim
steps the backend does not perform.

4.3. THE SYSTEM SHALL display the trust reassurance "You'll confirm everything before it's
saved" so the user knows the AI does not finalize alone.

4.4. WHEN extraction succeeds THE SYSTEM SHALL navigate to the Review & assign entry point
(feature #7), passing the persisted draft expense id.

4.5. IF extraction exceeds a defined client timeout THEN THE SYSTEM SHALL stop the spinner and
present a retry / "enter manually" choice rather than spinning indefinitely.

## Requirement 5 — Extraction returns structured items with confidence (the contract)

**User Story:** As the Review feature (#7) and the user behind it, I need the AI to return
structured line items with per-item confidence and amounts in pence, so that the app can show an
editable, trustworthy draft with "check this" flags.

#### Acceptance Criteria

5.1. WHEN extraction runs against a readable receipt THE SYSTEM SHALL return an ordered array of
line items, each with: a `description` (string), `quantity` (integer ≥ 1), `unitPriceMinor`
(integer pence ≥ 0), `lineTotalMinor` (integer pence ≥ 0), a `confidence` (float `0..1`), and an
optional `flagReason` (string or null).

5.2. THE SYSTEM SHALL express **all** monetary amounts as **integer pence (minor units)** and
SHALL NOT return fractional pence or float currency in any field.

5.3. THE SYSTEM SHALL set `currency` to `"GBP"` for V1 (the field is retained for future
multi-currency).

5.4. WHEN extraction detects the merchant THE SYSTEM SHALL return a `merchant` string; IF the
merchant cannot be read THEN THE SYSTEM SHALL return `merchant: null` rather than a fabricated
name.

5.5. WHEN extraction detects receipt-level adjustments (service charge, tip, tax, discount) THE
SYSTEM SHALL return an `adjustments` array, each with `kind`
(`service` | `tip` | `tax` | `discount`), a human `label`, an `amountMinor` (integer pence;
**negative for discounts**), and a `confidence` (`0..1`); detected percentage charges SHALL be
resolved to an integer-pence `amountMinor`.

5.6. THE SYSTEM SHALL return receipt totals as integer pence: `subtotalMinor` (sum of line
totals before adjustments), `adjustmentsTotalMinor`, and `totalMinor` as printed.

5.7. IF the sum of line totals plus adjustments does not equal the printed `totalMinor` THEN THE
SYSTEM SHALL still return the values it read, set a top-level `reconciled: false`, and SHALL NOT
silently alter amounts to force a match.

5.8. THE SYSTEM SHALL attach `confidence < 0.7` and/or a `flagReason` to any item it is unsure
about (e.g. ambiguous quantity, unreadable price), so the Review feature can render the amber
"check this" flag and the "N items need a quick check" summary.

5.9. THE SYSTEM SHALL NOT include any item assignment in the extraction response — assignment
(who owes what) is owned by feature #7; extraction returns items as **unassigned**.

## Requirement 6 — Degrade honestly on low-confidence or unreadable input

**User Story:** As a user with a crumpled or blurry receipt, I want the app to be honest when it
can't read something, so that I'm not handed a confidently wrong split.

#### Acceptance Criteria

6.1. IF the image is unreadable as a receipt (blank, not a receipt, too blurry) THEN THE SYSTEM
SHALL return a typed `unreadable` outcome with a human-readable reason and SHALL NOT fabricate
line items.

6.2. WHEN extraction returns an `unreadable` outcome THE SYSTEM SHALL present the user a choice
to retake/reimport the photo or proceed to manual entry, and SHALL NOT persist a draft full of
fabricated items.

6.3. WHEN extraction is partial (some items read, others not) THE SYSTEM SHALL return the items
it could read with appropriate low `confidence`/`flagReason` values and a top-level
`partial: true`, rather than failing the whole request.

6.4. IF overall extraction confidence is below a low-confidence threshold THEN THE SYSTEM SHALL
still return the draft but flag it so the Review screen leads with a "please check these" state.

6.5. THE SYSTEM SHALL never auto-finalize or auto-assign — every extracted draft requires the
user's confirmation in feature #7 (enforced there; this feature only ever produces `draft`).

## Requirement 7 — Persist the extracted draft

**User Story:** As a user, I want my scanned receipt saved as a draft I can come back to, so
that a dropped connection or app switch doesn't lose my work.

#### Acceptance Criteria

7.1. WHEN extraction succeeds (fully or partially) THE SYSTEM SHALL persist, via `packages/db`, a
draft `Expense` (`status = 'draft'`) linked to the `groupId` and the authenticated payer, with
`currency = 'GBP'` and the detected `merchant` and totals in pence.

7.2. THE SYSTEM SHALL persist each extracted line item as a receipt-item row carrying its
`description`, `quantity`, `unitPriceMinor`, `lineTotalMinor`, `confidence`, and `flagReason`,
with **no assignment** set (assignment is feature #7).

7.3. THE SYSTEM SHALL persist each detected adjustment row (`kind`, `label`, `amountMinor`,
`confidence`).

7.4. THE SYSTEM SHALL store the `receipt_image_key` on the draft expense so feature #7 can render
the "how AI read your receipt" overlay from the same S3 object.

7.5. THE SYSTEM SHALL return the persisted draft expense id (and the extraction contract payload)
so the client can navigate straight into Review without a second round-trip.

7.6. THE SYSTEM SHALL scope persistence to the authenticated user and a group they belong to;
IF the user is not a member of `groupId` THEN THE SYSTEM SHALL reject the request and persist
nothing.

7.7. IF persistence fails after a successful extraction THEN THE SYSTEM SHALL return an error the
client can retry, and SHALL NOT leave a partially-written draft (the write is one transaction).
