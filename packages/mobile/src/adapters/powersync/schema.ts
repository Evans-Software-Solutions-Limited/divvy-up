import { column, Schema, Table } from "@powersync/react-native";

/**
 * PowerSync client schema — the on-device SQLite mirror of the subset of
 * `packages/db/src/schema.ts` (Supabase Postgres, source of truth) that the
 * mobile app needs offline. Column names match the *Postgres* column names
 * verbatim (snake_case) since PowerSync replicates raw DB columns, not
 * Drizzle's camelCase JS accessors. PowerSync adds an implicit `id` text
 * primary key to every table, so it is never declared here.
 *
 * Server-only tables (`group_invites`, `activity`) are intentionally
 * omitted — no client screen needs them yet. Money stays integer pence and
 * custom split shares stay integer weights, exactly as in `packages/db`;
 * SQLite has no dedicated boolean/enum type, so Postgres `boolean` columns
 * become `column.integer` (0/1) and `pgEnum` columns become `column.text`.
 *
 * Keep this in sync with `packages/db/src/schema.ts` by hand — if you add,
 * rename, or drop a column there, mirror the change here (or note why it's
 * intentionally omitted).
 */

// Mirrors `groups` (packages/db/src/schema.ts): name, emoji, cover_index,
// created_by, created_at, updated_at.
const groups = new Table({
  name: column.text,
  emoji: column.text,
  cover_index: column.integer,
  created_by: column.text,
  created_at: column.text,
  updated_at: column.text,
});

// Mirrors `group_members`: group_id, user_id, name, colour_index,
// placeholder, active, created_at.
const groupMembers = new Table(
  {
    group_id: column.text,
    user_id: column.text,
    name: column.text,
    colour_index: column.integer,
    placeholder: column.integer, // boolean 0/1
    active: column.integer, // boolean 0/1
    created_at: column.text,
  },
  { indexes: { group: ["group_id"] } },
);

// Mirrors `expenses`: group_id, payer_member_id, description, date, status,
// receipt_image_key, merchant, currency, created_by, created_at, updated_at.
const expenses = new Table(
  {
    group_id: column.text,
    payer_member_id: column.text,
    description: column.text,
    date: column.text,
    status: column.text, // expense_status enum: 'draft' | 'finalized'
    receipt_image_key: column.text,
    merchant: column.text,
    currency: column.text,
    created_by: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { group: ["group_id"] } },
);

// Mirrors `receipt_items`: expense_id, description, unit_price, quantity,
// assignment_mode, confidence, flag, group_label, sort_order.
const receiptItems = new Table(
  {
    expense_id: column.text,
    description: column.text,
    unit_price: column.integer, // PENCE
    quantity: column.integer,
    assignment_mode: column.text, // assignment_mode enum, nullable = unassigned
    confidence: column.real, // 0..1, nullable
    flag: column.text,
    group_label: column.text,
    sort_order: column.integer,
  },
  { indexes: { expense: ["expense_id"] } },
);

// Mirrors `item_assignments`: item_id, member_id, share_weight.
const itemAssignments = new Table(
  {
    item_id: column.text,
    member_id: column.text,
    share_weight: column.integer, // integer weight, custom mode only
  },
  { indexes: { item: ["item_id"] } },
);

// Mirrors `receipt_adjustments`: expense_id, kind, is_percent, amount, label.
const receiptAdjustments = new Table(
  {
    expense_id: column.text,
    kind: column.text, // adjustment_kind enum: 'tax' | 'tip' | 'discount'
    is_percent: column.integer, // boolean 0/1
    amount: column.integer, // basis points if is_percent, else PENCE; discounts negative
    label: column.text,
  },
  { indexes: { expense: ["expense_id"] } },
);

// Mirrors `settlements`: group_id, from_member_id, to_member_id, amount,
// recorded_by, created_at.
const settlements = new Table(
  {
    group_id: column.text,
    from_member_id: column.text,
    to_member_id: column.text,
    amount: column.integer, // PENCE recorded as paid
    recorded_by: column.text,
    created_at: column.text,
  },
  { indexes: { group: ["group_id"] } },
);

export const AppSchema = new Schema({
  groups,
  group_members: groupMembers,
  expenses,
  receipt_items: receiptItems,
  item_assignments: itemAssignments,
  receipt_adjustments: receiptAdjustments,
  settlements,
});

export type Database = (typeof AppSchema)["types"];
export type GroupRow = Database["groups"];
export type GroupMemberRow = Database["group_members"];
export type ExpenseRow = Database["expenses"];
export type ReceiptItemRow = Database["receipt_items"];
export type ItemAssignmentRow = Database["item_assignments"];
export type ReceiptAdjustmentRow = Database["receipt_adjustments"];
export type SettlementRow = Database["settlements"];
