# Divvy Up — Document Intelligence Productionisation Plan

Date: 2026-04-16
Owner: Bradley Evans
Prepared by: Axel
Status: Strategic plan

## 1. Why this document exists

This document takes the earlier document-extraction / invoice-processing idea and maps it onto Divvy Up.

It answers four questions:

1. How does the idea fit the current Divvy Up product?
2. Where does it go beyond the current product?
3. What other markets or use cases can reuse the same capability?
4. What is the most productionisable version of this work?

This is not a coding spec. It is the bridge between:
- the current Divvy Up application,
- the broader document intelligence opportunity,
- and a repeatable product or productised service.

---

## 2. Core thesis

The valuable thing is not OCR by itself.

The valuable thing is this full workflow:

1. Ingest a document
2. Extract structured data from it
3. Validate the extracted result against business rules
4. Flag low-confidence or inconsistent cases
5. Send those cases to a human review step
6. Persist the reviewed result as a reliable financial or operational record
7. Use that structured record downstream

That workflow is much more commercially useful than “scan a receipt with AI”.

OCR is a feature.
Reviewable, validated, structured document handling is the product.

---

## 3. What Divvy Up is today

Divvy Up currently has the shape of a receipt-led shared expense app:
- groups
- members
- expenses
- receipt extraction
- line item assignment
- receipt adjustments
- balance calculation

That means Divvy Up already contains the early building blocks of a broader document understanding workflow:
- document ingestion
- structured extraction
- review UI
- assignment logic
- finalization
- downstream balance computation

So the document extraction idea is not an unrelated pivot.
It is an expansion of capabilities Divvy Up already wants.

---

## 4. How the document intelligence idea applies to Divvy Up

## 4.1 Direct fit with current product

The earlier idea maps naturally onto Divvy Up like this:

### Current Divvy Up flow
- upload receipt
- extract merchant/date/items/totals
- user reviews extracted result
- user assigns item ownership/split rules
- app finalizes expense and computes balances

### Document intelligence extension of that flow
- upload receipt/invoice/bill/contract/PO
- extract structured fields into a type-specific schema
- validate totals and key rules
- flag confidence issues or data mismatches
- review/correct if needed
- finalize into a structured domain record
- feed that record into balances, categories, reporting, or exports

The core pattern is the same.
Only the document type and downstream use case change.

## 4.2 Why this is strong for Divvy Up

Divvy Up already has a natural review step.
That matters.

A lot of document extraction products either:
- overpromise full automation, or
- stop at raw text extraction.

Divvy Up has a better natural product posture:
- AI suggests
- user confirms
- the system stores something trustworthy

That is a strong base for a document-driven product.

## 4.3 What changes when this grows beyond receipts

As soon as Divvy Up starts supporting:
- invoices
- recurring bills
- contracts
- purchase orders
- vendor paperwork

it stops being only a “split a dinner bill” product.

It becomes a broader financial-document workflow product.

That is not necessarily bad.
But it is a real category shift and should be treated as one.

---

## 5. Recommended product framing

## Short version

Divvy Up should not immediately become “an invoice processing platform”.

The better path is:

### Stage 1
Own the **receipt review and shared-expense truth** workflow.

### Stage 2
Extend that into **document-backed expense intelligence**.

### Stage 3
Decide explicitly whether to:
- keep it as a consumer/small-group product with richer document support, or
- split out a B2B finance/document product using the same engine.

This avoids product confusion while preserving the upside.

---

## 6. Product architecture we can productionise

The most productionisable version of this work is a modular document-processing pipeline with domain-specific output modes.

## 6.1 Canonical pipeline

### Step 1: Document ingest
Input sources:
- mobile camera capture
- image upload
- PDF upload
- email-forwarded attachments (later)
- cloud storage import (later)

Supported input types:
- receipt photo
- invoice PDF
- scanned bill
- simple contract PDF
- purchase order

### Step 2: Pre-processing
- image cleanup
- page detection / cropping
- OCR fallback for scanned docs
- document type detection

### Step 3: Extraction
Extract into a document-type schema.

Examples:

#### Receipt schema
- merchant
- date
- currency
- subtotal
- tax
- tip
- total
- line items

#### Invoice schema
- vendor
- invoice number
- invoice date
- due date
- line items
- subtotal
- tax
- total
- payment terms
- PO number

#### Contract schema
- counterparty
- start date
- renewal date
- termination clause summary
- payment schedule
- notice period

### Step 4: Validation
Validation should not be optional fluff. It is part of the product.

Examples:
- do line items add up to subtotal?
- does subtotal + tax + tip - discount equal total?
- does invoice number already exist?
- does PO number match expected format?
- are required fields missing?
- is confidence below threshold?

### Step 5: Review queue
If validation fails or confidence is low:
- send to review queue
- highlight uncertain fields
- allow quick correction
- show extracted source text or image region where useful

### Step 6: Finalization
Once confirmed, write a finalized structured record.

Examples:
- finalized shared expense
- finalized invoice record
- finalized recurring bill entry
- finalized contract metadata

### Step 7: Downstream actions
The finalized record can feed:
- Divvy Up balances
- categories and expense history
- reporting
- spreadsheets
- accounting exports
- reminders and renewals

---

## 7. Best fit inside Divvy Up itself

## 7.1 Near-term, still clearly Divvy Up

The most natural extensions that still feel like Divvy Up are:

### A. Household and recurring shared bills
Examples:
- electricity bill
- broadband bill
- council tax-related household bills
- shared grocery or home purchases

Why it fits:
- still fundamentally about splitting expenses between people
- document extraction makes setup easier
- balances remain the end product

### B. Better receipt intelligence
Examples:
- harder receipts
- merchant normalization
- duplicate detection
- low-confidence review
- category suggestions

Why it fits:
- improves current core loop
- no category confusion

### C. Subscription and recurring payment support
Examples:
- Netflix/Spotify shared cost
- household subscriptions
- recurring trip contributions

Why it fits:
- still shared-expense-first
- document extraction can help initialize the record

## 7.2 Stretch fit, but still plausible

### D. Small-group event or travel expense management
Examples:
- trip costs
- event food/drinks
- accommodation shared costs
- transport receipts

Why it fits:
- same balance engine
- same receipt review model
- same group-based product

---

## 8. Best adjacent markets using the same engine

These are realistic other areas where the same extraction + validation + review capability can be used.

## 8.1 Bookkeeping and accountancy firms

Use cases:
- extracting invoices and receipts
- categorizing expenses
- flagging mismatched totals
- reducing admin on client paperwork

Why attractive:
- repetitive work
- strong ROI
- lots of documents
- easier to sell than large internal finance transformation

Relationship to Divvy Up:
- likely adjacent or separate B2B mode
- same engine, different buyer and UX

## 8.2 Small business back-office automation

Use cases:
- vendor invoice intake
- receipt logging
- PO and invoice cross-checks
- contract renewal reminders

Why attractive:
- clear time savings
- can be sold as workflow automation or SaaS

Relationship to Divvy Up:
- adjacent
- likely needs different language and product surface

## 8.3 Lettings / property operations

Use cases:
- contractor invoices
- landlord expense paperwork
- renewal date extraction
- supplier bills

Why attractive:
- aligns with existing domain understanding
- operationally document-heavy

Relationship to Divvy Up:
- same extraction/review primitives
- probably better as separate ops product or service than inside Divvy Up consumer product

## 8.4 Legal or contract admin

Use cases:
- extract key dates and clauses
- identify notice periods
- summarize payment schedules

Why attractive:
- high-value downstream action from structured extraction

Relationship to Divvy Up:
- not a clean fit inside core product
- useful as future engine capability or separate product line

---

## 9. What is most productisable

If the goal is something we can genuinely productionise, the best candidate is not “generic AI document extraction for everything”.

The best candidate is:

## Option 1, strongest product path inside Divvy Up

**Divvy Up = receipt-led shared expenses with document-backed review and validation**

Why this is productisable:
- clear user story
- coherent UX
- differentiated by item-level review and assignment
- easier to explain than broad finance automation
- can grow from consumer/shared groups into richer expense handling

What gets productised:
- upload → extract → review → finalize → balances
- recurring/shared bills later
- reliability, speed, auditability

## Option 2, strongest adjacent B2B product path

**A structured document review engine for receipts, invoices, and bills with validation and human review**

Why this is productisable:
- repeatable workflow
- clear business ROI
- modular architecture
- separable from chat assistant fluff

What gets productised:
- document schemas
- validation rules
- review queue
- finalized record storage
- export/integration layer

## Recommendation

Treat Option 1 as the current product.
Treat Option 2 as the expansion or spinout candidate.

Do not try to market both as the same thing yet.

---

## 10. Commercialisation paths

## 10.1 Divvy Up product path

Possible monetisation later:
- freemium for casual groups
- paid tier for recurring bills/history/advanced OCR
- premium tier for better review workflows, exports, smart reminders

Good for:
- consumer and prosumer adoption
- app-led growth

## 10.2 B2B SaaS path

Possible monetisation:
- base monthly platform fee
- document volume pricing
- premium review/validation features
- integrations/export tier

Good for:
- bookkeeping firms
- admin-heavy teams
- small finance operations

## 10.3 Productised service path

Possible monetisation:
- setup fee
- monthly support retainer
- optional per-document usage bands

Good for:
- local and regional businesses
- quick revenue
- validating which workflows deserve software productisation later

## Strategic recommendation

Use the service path to learn B2B document pains if needed, without forcing Divvy Up itself to become the first commercial container for all of them.

---

## 11. Recommended productionisation roadmap

## Phase A, make Divvy Up real

Goal:
Turn the current scaffold into a trustworthy shared-expense application.

Focus:
- real persistence
- backend-backed review flow
- backend-owned balance truth
- consistent tax/tip/discount behavior
- honest balances/history flow

This is non-negotiable before broadening.

## Phase B, make the extraction engine trustworthy

Goal:
Make extraction robust, editable, and auditable.

Focus:
- real OCR/vision implementation
- confidence handling
- manual corrections
- validation layer
- review queue patterns

This phase is partly platform work, partly product work.

## Phase C, extend into richer shared-expense documents

Goal:
Use the engine for more than restaurant receipts while staying product-coherent.

Focus:
- household bills
- recurring subscriptions
- event/travel expenses
- better merchant/line item normalization

## Phase D, test adjacent B2B surface intentionally

Goal:
Evaluate whether the same core engine should power a separate business-facing product or service.

Focus:
- invoice extraction
- bookkeeping/accountancy workflows
- validation/export layers
- limited pilot customers

## Decision gate
At the end of Phase D decide explicitly:
- double down on Divvy Up consumer/prosumer product
- launch a separate B2B product
- or keep B2B as a productised service only

---

## 12. Product risks

## Risk 1: category confusion
If Divvy Up tries to be both:
- a friendly shared-expense app, and
- a serious business document automation platform,

it may become muddy and weak at both.

## Risk 2: broadening too early
Invoice, contract, and AP workflows are attractive, but they can pull the team away from finishing the core product truthfully.

## Risk 3: trusting extraction too much
The product only works if validation and review are first-class citizens.

## Risk 4: building a feature pile instead of a product
The winning thing is not “support more document types”.
The winning thing is a repeatable, trustworthy workflow.

---

## 13. Decision framework

Use this when evaluating whether a new document use case belongs inside Divvy Up.

A use case belongs in Divvy Up if:
- it ends in shared expense understanding or balances
- it naturally fits a group/member/payer model
- it benefits from the same review UI pattern
- it does not force enterprise-heavy UX into the core app

A use case probably belongs outside Divvy Up if:
- it is mainly about company operations, procurement, or finance admin
- it needs ERP/accounting integrations first
- it is contract-heavy rather than expense-heavy
- the buyer is a finance team, not a person or small group

---

## 14. Recommended position from here

My recommendation is:

### 1. Keep Divvy Up’s center of gravity
Divvy Up should remain a receipt-led shared-expense product first.

### 2. Capture the document intelligence work as an engine capability
The extraction, validation, and review system is strategically valuable and reusable.

### 3. Productise in layers
- layer 1: Divvy Up core product
- layer 2: document intelligence engine capability
- layer 3: separate B2B or service applications if the demand proves real

### 4. Do not force premature convergence
It is fine if the same technical core eventually powers multiple products or offers.
It does not all need to be one product name today.

---

## 15. Plain-English summary

The invoice/document extraction idea is strong.
It fits Divvy Up because Divvy Up already has the important pattern: extract, review, confirm, finalize.

But the most sensible path is not to turn Divvy Up overnight into a generic finance automation platform.

The sensible path is:
- make Divvy Up excellent at receipt-led shared expenses
- build the extraction/validation/review capability in a reusable way
- use that capability later for richer documents, B2B workflows, and productised services

That gives us something real to ship, something valuable to reuse, and something we can eventually productionise without losing the plot.
