# Divvy Up

## Product Positioning
Divvy Up is a lightweight mobile-first shared expense app for small groups, trips, and household costs, with receipt scanning and item-level split assignment as the core differentiator.

## V1 Goal
Let a user create a group, upload or photograph a receipt, review extracted line items, assign each item to one person / selected people / everyone / custom shares, and compute balances clearly.

## V1 Core Features
- Group creation and member management
- Expense creation with payer
- Receipt image upload/capture
- OCR/vision extraction into structured receipt items
- Item-level assignment rules:
  - one person
  - equal split among selected people
  - split among everyone
  - custom shares
- Receipt-level extras:
  - tax
  - tip/service charge
  - discount
- Group balance summary

## What We Are NOT Building In V1
- bank integrations
- direct money movement
- budgeting/analytics dashboards
- multi-currency settlement engine
- full offline sync
- social feed / chat layer

## Product Principles
- AI suggests; user confirms
- editing a receipt must be fast
- no hidden split math
- mobile-first, lightweight, personal-use focused

## Likely Architecture
- Expo / React Native mobile app
- SST backend
- Postgres
- object storage for receipt images
- OCR/vision extraction path returning structured JSON

## First Milestone
- repo scaffold from SST template
- initial mobile app shell for Divvy Up
- backend domain scaffold for groups / expenses / receipt items / assignments
- product docs and work order committed
