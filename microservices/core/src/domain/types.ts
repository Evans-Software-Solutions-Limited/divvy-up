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
  /** Fraction of the item cost, e.g. 0.5 for 50% */
  fraction: number;
};

// ─── Receipt-level adjustments ────────────────────────────────────────────────

export type AdjustmentKind = "tax" | "tip" | "discount";

export type ReceiptAdjustment = {
  kind: AdjustmentKind;
  /** Amount in minor currency units; negative for discounts */
  amount: number;
  /** If true the amount is a percentage of the subtotal (0–100) */
  isPercent: boolean;
};

// ─── Balance ──────────────────────────────────────────────────────────────────

/** Net amount owed per member pair within a group */
export type Balance = {
  groupId: GroupId;
  fromMemberId: MemberId;
  toMemberId: MemberId;
  /** Amount in minor currency units; positive = fromMember owes toMember */
  amount: number;
};
