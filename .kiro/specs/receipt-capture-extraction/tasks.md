# Tasks — Receipt Capture & Extraction

> Feature #6, one shippable PR. Ordered **frontend-first → backend → wire-up** per
> `steering/tech.md`. Each task is code/test and builds on the previous. The Extraction Contract
> in `design.md` is defined up front (Task 1) because it is the FE↔BE bridge.
> Dependencies: foundations 1–4 must be in place.

## Phase 0 — Contract first

- [ ] **1. Define the Extraction Contract types**
      Rewrite `microservices/other-service/src/types/receipt.ts` to the GBP/pence contract from
      `design.md`: `ExtractedItem` (with `confidence` + `flagReason`, integer `*Minor`),
      `ExtractedAdjustment` (`kind` ∈ tax|tip|discount, `isPercent`, signed `amount` = bps|pence),
      `ExtractionResult` (`outcome:"extracted"`,
      `draftExpenseId`, `reconciled`, `partial`, `overallConfidence`), `UnreadableResult`, and the
      `ExtractResponse` union. Export them so the mock client and eden client share one source of
      truth. No assignment field on items.
      _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.9_

## Phase 1 — Frontend against a typed mock client

- [ ] **2. Typed mock extract client + fixtures**
      Add `packages/mobile/src/adapters/extractClient.ts` with the `ExtractClient` interface
      (`getUploadUrl`, `extract`) and a `mockExtractClient` returning fixtures typed to the Task 1
      contract: a clean high-confidence receipt, one with a service-charge adjustment, a
      low-confidence item (`confidence < 0.7` + `flagReason`), and an `unreadable` outcome. Unit-test
      the fixtures conform to the contract.
      _Requirements: 5.1, 5.4, 5.5, 5.8, 6.1_

- [ ] **3. Image-prepare util**
      Add `prepareImage` (`expo-image-manipulator`): downscale to a bounded max dimension and
      re-encode JPEG; one pipeline for capture and import. Unit-test bounds + output type.
      _Requirements: 1.5, 2.5_

- [ ] **4. Camera capture screen**
      Build `CameraScreen` (`expo-camera`) porting the prototype: receipt-framing viewfinder, framing
      guidance copy, torch toggle, capture + library buttons. Handle camera permission states
      including denial (explanatory state + settings link + import alternative). On capture, run
      `prepareImage` and advance to upload. Tests: permission granted/denied, torch toggle, capture
      advances.
      _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6_

- [ ] **5. Photo-library import**
      Add `useImagePicker` (`expo-image-picker`): open picker, accept JPEG/PNG/HEIC, validate
      type/size, reject + allow re-pick on failure, run through `prepareImage`. Wire the library
      button to it. Handle library-permission denial. Tests: select, reject unsupported/oversize.
      _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] **6. Upload step with honest progress (against mock)**
      Add `useReceiptUpload`: call `mockExtractClient.getUploadUrl`, simulate the PUT with progress,
      cancel, and retry-on-failure; never proceed to extract on upload failure. Build the upload UI
      state. Tests: progress, cancel, retry, no-extract-on-failure.
      _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] **7. AI-processing screen (against mock)**
      Build `ProcessingScreen` porting the prototype: honest progress steps driven by the response,
      the "You'll confirm everything before it's saved" reassurance, a client timeout that stops the
      spinner and offers retry/manual. On `extracted` → navigate to the Review entry point
      (feature #7) with `draftExpenseId`; on `unreadable` → show retake / import / enter-manually.
      Tests: success-navigates, unreadable-branch, timeout-branch; snapshot progress copy.
      _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 6.2_

- [ ] **8. Capture flow wiring**
      Add `ReceiptCaptureFlow` (expo-router stack) tying Camera → Upload → Processing, owning the
      `unreadable` retake/manual branch and entry from Home / a group. Flag (comment + a stubbed
      "Enter manually" target) that the manual add-expense path is **not yet designed** and belongs
      to feature #7. Tests: full happy path and unreadable path against the mock client.
      _Requirements: 1.1, 4.4, 6.2, 6.5_

## Phase 2 — Storage + upload path (backend)

- [ ] **9. S3 receipts bucket**
      Add `infra/storage.ts` with an `sst.aws.Bucket` for receipt images; link it to
      `receiptServiceAPI` in `infra/api.ts`. Configure private access (no public read). Reference it
      from `sst.config.ts`.
      _Requirements: 3.1, 3.2, 7.4_

- [ ] **10. ReceiptStorageRepository + presign endpoint**
      Add `ReceiptStorageRepository` (key minting `receipts/{userId}/{groupId}/{uuid}.jpg`, presign
      PUT, `getObject`, key-ownership validation) and `receiptUploadHandler`
      (`POST /receipts/upload-url`, plus the `/receipts/upload` multipart proxy fallback). Assert JWT
      auth + group membership; reject non-members (403). Tests: key namespacing, membership guard,
      presign response shape.
      _Requirements: 3.1, 3.2, 3.6, 7.6_

## Phase 3 — Real extraction with confidence (backend)

- [ ] **11. ExtractionProvider interface + FixtureExtractionProvider + fixtures**
      Define `ExtractionProvider.extract(image, hint)` returning `Result<RawExtraction, ExtractError>`.
      Add `FixtureExtractionProvider` and the fixture-receipt corpus in `__tests__/fixtures/`: clean
      receipt, café-with-service-charge, low-confidence item (Espresso-style), unreadable item
      (Affogato-style), fully-unreadable image, and a non-reconciling total.
      _Requirements: 5.1, 5.5, 5.7, 5.8, 6.1, 6.3_

- [ ] **12. Real ExtractionProvider (Textract or Claude vision)**
      Implement the chosen provider (`TextractExtractionProvider` **or**
      `ClaudeVisionExtractionProvider`) selected by config/secret (`sst.Secret`). Map raw model
      output to `RawExtraction`: per-item confidence, optional flag reason, merchant, adjustments;
      resolve percentage charges to integer pence. Opt-in (env-gated, non-default-CI) integration test
      asserting shape/tolerances on fixture images.
      _Requirements: 5.1, 5.4, 5.5, 5.8, 6.3_

- [ ] **13. ReceiptExtractService normalization**
      Implement `ReceiptExtractService`: fetch object → call provider → normalize to the contract —
      clamp money to integer pence, clamp confidence to `0..1`, compute `subtotalMinor`,
      `adjustmentsTotalMinor`, set `reconciled` when sums mismatch (never alter amounts), set
      `partial` and `overallConfidence`, map a non-receipt to `outcome:"unreadable"`. Tests cover each
      fixture and each normalization rule.
      _Requirements: 5.1, 5.2, 5.6, 5.7, 5.8, 6.1, 6.3, 6.4_

## Phase 4 — Persist the draft (backend)

- [ ] **14. DraftExpenseRepository (packages/db)**
      Add the draft-from-extraction write path: insert a `draft` `expenses` row
      (`status='draft'`, `currency='GBP'`, `merchant`, `receipt_image_key`,
      `payer_member_id` = the creator's group membership) plus `receipt_items` (with
      `confidence`/`flag`/`sort_order`, **no assignment**) and `receipt_adjustments`
      (`kind`/`is_percent`/`amount`/`label`), **in one transaction**, scoped to user + group. Tests:
      rows land, items unassigned, signed discounts, transaction rolls back fully on failure.
      _Requirements: 7.1, 7.2, 7.3, 7.4, 7.6, 7.7_

- [ ] **15. Rewrite receiptExtractHandler to persist + return draft id**
      Rewrite `POST /receipts/extract`: validate body, assert auth + membership + key ownership, call
      the service, persist via `DraftExpenseRepository`, return `ExtractionResult` with
      `draftExpenseId` (or `UnreadableResult` with no persistence). Map errors to 403/404/422/504 per
      the contract. Rewrite `receiptExtractHandler.test.ts` for the new GBP/pence/confidence contract
      and the union response. Remove the mock `receiptExtractRepository`.
      _Requirements: 4.1, 5.9, 6.1, 6.2, 6.5, 7.5, 7.6, 7.7_

## Phase 5 — Wire-up + integration

- [ ] **16. Real eden extract client + swap the mock**
      Implement the eden/treaty `ExtractClient` against `receiptServiceAPI` (typed from the exported
      Elysia app), wire real upload (presigned PUT) into `useReceiptUpload`, and swap
      `mockExtractClient` out at the adapter layer (keep mock for tests). Mobile screens now run
      end-to-end against the real backend.
      _Requirements: 3.2, 3.5, 4.1, 4.4_

- [ ] **17. End-to-end integration test (FixtureExtractionProvider)**
      Capture → upload → extract → draft-persisted, against the deployed `receiptServiceAPI` with
      `FixtureExtractionProvider` enabled: assert a `draft` expense + items + `receipt_image_key` land
      in `packages/db`, the contract is returned with `draftExpenseId`, and the `unreadable` branch
      persists nothing. Confirm typecheck/lint/prettier pass and coverage meets the repo bar.
      _Requirements: 4.4, 6.1, 6.2, 7.1, 7.2, 7.4, 7.5_
