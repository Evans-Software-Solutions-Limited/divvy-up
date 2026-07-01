import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  real,
  boolean,
  timestamp,
  date,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── Enums ──────────────────────────────────────────────────────────────────
//
// All money columns are `integer` PENCE. Custom splits use integer
// `share_weight`, never floats. This mirrors the frontend's pence-based money
// and largest-remainder split engine.

export const expenseStatus = pgEnum("expense_status", ["draft", "finalized"]);

export const assignmentMode = pgEnum("assignment_mode", [
  "one",
  "equal",
  "everyone",
  "custom",
]);

export const adjustmentKind = pgEnum("adjustment_kind", [
  "tax",
  "tip",
  "discount",
]);

export const activityKind = pgEnum("activity_kind", [
  "expense_added", // emitted when an expense is finalized (becomes part of balances)
  "settled_up",
  "member_added",
]);

// ─── users ── (id == Supabase Auth user id) ───────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey(), // == Supabase auth.users.id (the JWT `sub`)
  email: text("email").notNull().unique(),
  // nullable: base JWT claims carry no name; provisioning derives from email / user_metadata
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── groups ───────────────────────────────────────────────────────────────────

export const groups = pgTable(
  "groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    emoji: text("emoji"), // e.g. "🍝"
    coverIndex: integer("cover_index"), // people-palette slot 0..7 → --p1..--p8 (nullable)
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byCreator: index("groups_created_by_idx").on(t.createdBy),
    coverRange: check(
      "groups_cover_index_range",
      sql`${t.coverIndex} is null or (${t.coverIndex} between 0 and 7)`,
    ),
  }),
);

// ─── group_members ── (join: group ↔ person; person may be accountless) ────────

export const groupMembers = pgTable(
  "group_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }), // null = placeholder
    name: text("name").notNull(), // display name (placeholder or cached)
    colourIndex: integer("colour_index").notNull(), // 0..7 people-palette slot → --p1..--p8
    placeholder: boolean("placeholder").notNull().default(false),
    // soft-delete: members referenced by expenses/assignments (FK restrict) can't be
    // hard-deleted, so removal flips `active` to false. Ownership is NOT a column — it is
    // derived (`group_members.user_id == groups.created_by`).
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byGroup: index("group_members_group_idx").on(t.groupId),
    // one membership per real account per group (placeholders have null user_id, excluded)
    uniqUserPerGroup: uniqueIndex("group_members_group_user_uniq")
      .on(t.groupId, t.userId)
      .where(sql`${t.userId} is not null`),
    colourRange: check(
      "group_members_colour_range",
      sql`${t.colourIndex} between 0 and 7`,
    ),
  }),
);

// ─── group_invites ── (invite tokens; store a HASH, never the raw token) ───────

export const groupInvites = pgTable(
  "group_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    // the placeholder seat this invite fills, if any (null = open invite → new member on accept)
    memberId: uuid("member_id").references(() => groupMembers.id, {
      onDelete: "set null",
    }),
    tokenHash: text("token_hash").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }), // null until accepted
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqTokenHash: uniqueIndex("group_invites_token_hash_uniq").on(t.tokenHash),
    byGroup: index("group_invites_group_idx").on(t.groupId),
  }),
);

// ─── expenses ── (single payer; pence) ─────────────────────────────────────────

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    payerMemberId: uuid("payer_member_id")
      .notNull()
      .references(() => groupMembers.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    date: date("date").notNull(), // receipt date; writers coalesce an unknown date → today
    status: expenseStatus("status").notNull().default("draft"),
    receiptImageKey: text("receipt_image_key"), // S3 key, nullable (manual expense)
    merchant: text("merchant"),
    currency: text("currency").notNull().default("GBP"), // ISO 4217; GBP for V1
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byGroup: index("expenses_group_idx").on(t.groupId),
  }),
);

// ─── receipt_items ── (pence; confidence 0..1; optional flag / group label) ────

export const receiptItems = pgTable(
  "receipt_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    unitPrice: integer("unit_price").notNull(), // PENCE
    quantity: integer("quantity").notNull().default(1),
    // The item's assignment MODE lives here (null = unassigned). `everyone` is stored as the mode
    // alone with NO item_assignments rows, so it resolves dynamically to the group's CURRENT
    // members at finalize. `one`/`equal`/`custom` carry member rows in item_assignments.
    assignmentMode: assignmentMode("assignment_mode"), // null until assigned
    // `real` (float4), NOT `numeric` — Drizzle maps `numeric` to a JS string, which would break
    // the split engine's `conf < 0.7` and the wire `confidence: number`. `real` returns a number.
    confidence: real("confidence"), // 0..1, AI only (nullable for manual items)
    flag: text("flag"), // e.g. "Couldn't read who this was for"
    groupLabel: text("group_label"), // e.g. "The wine round"
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => ({
    byExpense: index("receipt_items_expense_idx").on(t.expenseId),
    qtyPositive: check("receipt_items_qty_positive", sql`${t.quantity} > 0`),
    confRange: check(
      "receipt_items_confidence_range",
      sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
    ),
  }),
);

// ─── item_assignments ── (join: item ↔ member; member rows for one|equal|custom)
// The MODE lives on receipt_items. This table holds the explicit member list for `one` (1 row),
// `equal` (N rows), and `custom` (N rows, each with a positive integer weight). `everyone` and
// `unassigned` items have NO rows here.

export const itemAssignments = pgTable(
  "item_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => receiptItems.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => groupMembers.id, { onDelete: "restrict" }),
    shareWeight: integer("share_weight"), // INTEGER weight, custom only (e.g. 2:1); null otherwise
  },
  (t) => ({
    byItem: index("item_assignments_item_idx").on(t.itemId),
    uniqMember: uniqueIndex("item_assignments_item_member_uniq").on(
      t.itemId,
      t.memberId,
    ),
    // a weight, when present, must be a positive integer (custom rows); the repository enforces
    // that weights appear iff the item's mode is `custom`, since that mode lives on receipt_items.
    weightRule: check(
      "item_assignments_weight_rule",
      sql`${t.shareWeight} is null or ${t.shareWeight} > 0`,
    ),
  }),
);

// ─── receipt_adjustments ── (tax|tip|discount; percent-or-fixed; discounts negative)

export const receiptAdjustments = pgTable(
  "receipt_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    kind: adjustmentKind("kind").notNull(),
    isPercent: boolean("is_percent").notNull(),
    // when isPercent: rate in basis points (1250 = 12.50%); else fixed PENCE.
    // discounts stored negative.
    amount: integer("amount").notNull(),
    label: text("label"), // e.g. "Service charge"
  },
  (t) => ({
    byExpense: index("receipt_adjustments_expense_idx").on(t.expenseId),
  }),
);

// ─── settlements ── (mark-as-paid record only; NO money movement) ──────────────

export const settlements = pgTable(
  "settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    fromMemberId: uuid("from_member_id")
      .notNull()
      .references(() => groupMembers.id, { onDelete: "restrict" }),
    toMemberId: uuid("to_member_id")
      .notNull()
      .references(() => groupMembers.id, { onDelete: "restrict" }),
    amount: integer("amount").notNull(), // PENCE recorded as paid
    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byGroup: index("settlements_group_idx").on(t.groupId),
    notSelf: check(
      "settlements_not_self",
      sql`${t.fromMemberId} <> ${t.toMemberId}`,
    ),
  }),
);

// ─── activity ── (feed entries) ────────────────────────────────────────────────

export const activity = pgTable(
  "activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    // actor is always known at creation (wire type requires it); members are soft-deleted
    // (active=false), not hard-deleted, so `restrict` is consistent with expenses/settlements.
    actorMemberId: uuid("actor_member_id")
      .notNull()
      .references(() => groupMembers.id, { onDelete: "restrict" }),
    kind: activityKind("kind").notNull(),
    text: text("text").notNull(),
    amount: integer("amount"), // PENCE, nullable
    expenseId: uuid("expense_id").references(() => expenses.id, {
      onDelete: "set null",
    }),
    settlementId: uuid("settlement_id").references(() => settlements.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byGroupRecent: index("activity_group_created_idx").on(
      t.groupId,
      t.createdAt,
    ),
  }),
);

// ─── Schema-inferred types (source of truth for row shapes) ───────────────────

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type GroupRow = typeof groups.$inferSelect;
export type NewGroupRow = typeof groups.$inferInsert;
export type GroupMemberRow = typeof groupMembers.$inferSelect;
export type NewGroupMemberRow = typeof groupMembers.$inferInsert;
export type GroupInviteRow = typeof groupInvites.$inferSelect;
export type NewGroupInviteRow = typeof groupInvites.$inferInsert;
export type ExpenseRow = typeof expenses.$inferSelect;
export type NewExpenseRow = typeof expenses.$inferInsert;
export type ReceiptItemRow = typeof receiptItems.$inferSelect;
export type NewReceiptItemRow = typeof receiptItems.$inferInsert;
export type ItemAssignmentRow = typeof itemAssignments.$inferSelect;
export type NewItemAssignmentRow = typeof itemAssignments.$inferInsert;
export type ReceiptAdjustmentRow = typeof receiptAdjustments.$inferSelect;
export type NewReceiptAdjustmentRow = typeof receiptAdjustments.$inferInsert;
export type SettlementRow = typeof settlements.$inferSelect;
export type NewSettlementRow = typeof settlements.$inferInsert;
export type ActivityRow = typeof activity.$inferSelect;
export type NewActivityRow = typeof activity.$inferInsert;
