// Divvy Up domain types
// These represent the core entities. DB-backed shapes will extend these.

export type GroupId = string;
export type MemberId = string;
export type ExpenseId = string;
export type ReceiptItemId = string;

// ─── Group ────────────────────────────────────────────────────────────────────

export type Group = {
  id: GroupId;
  name: string;
  createdAt: string;
  members: Member[];
};

// ─── Member ───────────────────────────────────────────────────────────────────

export type Member = {
  id: MemberId;
  groupId: GroupId;
  name: string;
  /** Placeholder for future auth user linkage */
  userId?: string;
};

// ─── Group invite ─────────────────────────────────────────────────────────────

/**
 * A shareable join-by-link invite for a group. The raw token is a bearer
 * capability returned only once at creation (see `inviteToken.ts`); this view
 * NEVER carries the token or its hash.
 */
export type GroupInvite = {
  id: string;
  groupId: GroupId;
  /** The placeholder seat this invite fills, if any (null = open invite → new member on accept). */
  memberId: MemberId | null;
  /** ISO timestamp after which the invite can no longer be redeemed. */
  expiresAt: string;
  /** ISO timestamp of first redemption for single-use (seat) invites; null otherwise. */
  usedAt: string | null;
  createdAt: string;
};

/** Minimal, pre-join preview of a group, gated only by holding a valid token. */
export type InvitePreview = {
  groupId: GroupId;
  groupName: string;
  /** Count of active members (placeholder + linked). */
  memberCount: number;
};

// ─── Expense ──────────────────────────────────────────────────────────────────

export type Expense = {
  id: ExpenseId;
  groupId: GroupId;
  payerId: MemberId;
  description: string;
  /** ISO date string */
  date: string;
  /** S3 key for the receipt image, if uploaded */
  receiptImageKey?: string;
  items: ReceiptItem[];
  adjustments: ReceiptAdjustment[];
  status: ExpenseStatus;
  /** Merchant name from OCR extraction, if available */
  merchant?: string;
  /** ISO 4217 currency code, defaults to USD */
  currency: string;
};

// ─── Receipt item ─────────────────────────────────────────────────────────────

export type ReceiptItem = {
  id: ReceiptItemId;
  expenseId: ExpenseId;
  description: string;
  /** Unit price in minor currency units (e.g. pence / cents) */
  unitPrice: number;
  quantity: number;
  assignment: ItemAssignment;
};

// ─── Item assignment ──────────────────────────────────────────────────────────

export type ItemAssignment =
  | { type: "one"; memberId: MemberId }
  | { type: "equal"; memberIds: MemberId[] }
  | { type: "everyone" }
  | { type: "custom"; shares: CustomShare[] };

export type CustomShare = {
  memberId: MemberId;
  /**
   * Relative weight of this member's share, normalized across the item's
   * shares by the split engine — only the ratios matter, not the absolute
   * magnitude. `[0.5, 0.5]`, `[1, 1]`, and `[3, 3]` all split an item evenly.
   * The whole item cost is always distributed across the listed shares
   * (they implicitly sum to the total); to leave part of an item on the
   * payer, include the payer as one of the shares. Persisted as an integer
   * `share_weight` in the DB (see packages/db `item_assignments`).
   */
  fraction: number;
};

// ─── Receipt-level adjustments ────────────────────────────────────────────────

export type AdjustmentKind = "tax" | "tip" | "discount";

export type ReceiptAdjustment = {
  kind: AdjustmentKind;
  /**
   * When `isPercent` is false: a fixed amount in minor currency units (pence).
   * When `isPercent` is true: a rate in *basis points* (1250 = 12.50%) applied
   * to the subtotal. Discounts are stored negative in both cases.
   */
  amount: number;
  /** If true, `amount` is a basis-point rate rather than fixed pence. */
  isPercent: boolean;
};

// ─── Expense status ───────────────────────────────────────────────────────────

export type ExpenseStatus = "draft" | "finalized";

// ─── Balance ──────────────────────────────────────────────────────────────────

/** Net amount owed per member pair within a group */
export type Balance = {
  groupId: GroupId;
  fromMemberId: MemberId;
  toMemberId: MemberId;
  /** Amount in minor currency units; positive = fromMember owes toMember */
  amount: number;
};

// ─── Settlement ───────────────────────────────────────────────────────────────

/**
 * A recorded "mark-as-paid" between two members. V1 is record-keeping only —
 * no money moves. `fromMember` has paid `toMember` `amount` pence, which
 * cancels that much of the debt when balances are recomputed.
 */
export type Settlement = {
  id: string;
  groupId: GroupId;
  fromMemberId: MemberId;
  toMemberId: MemberId;
  /** Amount paid, in minor currency units (pence). Always a positive integer. */
  amount: number;
  /** The authenticated user who recorded this settlement. */
  recordedBy: string;
  /** ISO timestamp */
  createdAt: string;
};
