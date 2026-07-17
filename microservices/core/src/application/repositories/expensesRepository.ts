import { and, asc, eq, inArray } from "drizzle-orm";
import {
  expenses,
  getDb,
  groupMembers,
  itemAssignments,
  receiptAdjustments,
  receiptItems,
  type Db,
  type ExpenseRow,
  type ReceiptAdjustmentRow,
  type ReceiptItemRow,
} from "@divvy-up/db";
import type {
  CustomShare,
  Expense,
  ItemAssignment,
  ReceiptAdjustment,
  ReceiptItem,
} from "../../domain/types";
import { isActiveMember } from "./membership";
import { isUuid } from "./isUuid";
import { activityText, recordActivity } from "./activityRepository";
import { resolveActorMember } from "./resolveMember";

/**
 * The finalized expense's full receipt total in pence: the item subtotal plus
 * every adjustment (fixed pence directly; percent adjustments — basis points —
 * applied to the item subtotal). This is display metadata for the activity feed
 * only — deliberately NOT the `computeBalances` "distributable subtotal" (which
 * excludes unassigned consumption); it's "what the receipt came to", and it
 * never feeds balance math.
 */
function expenseTotalPence(expense: Expense): number {
  const subtotal = expense.items.reduce(
    (sum, it) => sum + it.unitPrice * it.quantity,
    0,
  );
  const adjustments = expense.adjustments.reduce(
    (sum, adj) =>
      sum +
      (adj.isPercent
        ? Math.round((subtotal * adj.amount) / 10000)
        : adj.amount),
    0,
  );
  return subtotal + adjustments;
}

type CreateExpenseInput = Omit<
  Expense,
  "id" | "items" | "adjustments" | "status"
> & {
  items: Omit<Expense["items"][number], "id" | "expenseId">[];
  adjustments?: Expense["adjustments"];
};

// ─── Assignment parsing (domain ItemAssignment ↔ DB mode + rows) ──────────────

type AssignmentModeValue = "one" | "equal" | "everyone" | "custom";

type AssignmentRow = { memberId: string; shareWeight: number | null };

type ParsedAssignment = {
  mode: AssignmentModeValue;
  rows: AssignmentRow[];
};

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Normalise fractional custom shares into positive integer weights.
 * `w = round(fraction * 10000)`, then divide all by their GCD — only the
 * ratios matter (`computeBalances` treats them as pure weights).
 */
function normaliseCustomWeights(
  shares: CustomShare[],
): { memberId: string; shareWeight: number }[] {
  if (shares.length === 0) {
    throw new Error("Custom assignment requires at least one share");
  }
  const raw = shares.map((s) => Math.round(s.fraction * 10000));
  if (raw.some((w) => w < 1)) {
    throw new Error(
      "Custom assignment shares must resolve to a positive integer weight",
    );
  }
  const divisor = raw.reduce((acc, w) => gcd(acc, w));
  return shares.map((s, i) => ({
    memberId: s.memberId,
    shareWeight: raw[i] / divisor,
  }));
}

function parseAssignment(assignment: ItemAssignment): ParsedAssignment {
  switch (assignment.type) {
    case "one":
      return {
        mode: "one",
        rows: [{ memberId: assignment.memberId, shareWeight: null }],
      };
    case "equal":
      return {
        mode: "equal",
        rows: assignment.memberIds.map((memberId) => ({
          memberId,
          shareWeight: null,
        })),
      };
    case "everyone":
      // Resolved dynamically at finalize — that's the schema's design, so no
      // item_assignments rows are stored for `everyone`.
      return { mode: "everyone", rows: [] };
    case "custom": {
      const weighted = normaliseCustomWeights(assignment.shares);
      return {
        mode: "custom",
        rows: weighted.map((w) => ({
          memberId: w.memberId,
          shareWeight: w.shareWeight,
        })),
      };
    }
    default:
      throw new Error(`Unsupported assignment: ${JSON.stringify(assignment)}`);
  }
}

/** Reverse of `parseAssignment`: DB mode + rows → domain `ItemAssignment`. */
function toItemAssignment(
  mode: AssignmentModeValue | null,
  rows: AssignmentRow[],
): ItemAssignment {
  switch (mode) {
    case "one": {
      // FK `restrict` + cascade guarantee a live `one` item keeps its single
      // row, so this is only reachable via manual data corruption — degrade to
      // the empty-equal no-op rather than throwing on `rows[0]` of an empty set.
      const only = rows[0];
      if (!only) return { type: "equal", memberIds: [] };
      return { type: "one", memberId: only.memberId };
    }
    case "equal":
      return { type: "equal", memberIds: rows.map((r) => r.memberId) };
    case "everyone":
      return { type: "everyone" };
    case "custom":
      return {
        type: "custom",
        // Integer weights come back through the `fraction` field —
        // ratio-equivalent to the input, not the original literal fractions.
        shares: rows.map((r) => ({
          memberId: r.memberId,
          fraction: r.shareWeight ?? 0,
        })),
      };
    case null:
    default:
      // No "unassigned" variant in the domain union yet; empty-equal is a
      // no-op in the split math.
      return { type: "equal", memberIds: [] };
  }
}

// ─── Row → domain hydration helpers ────────────────────────────────────────

function toReceiptItem(
  row: ReceiptItemRow,
  assignmentRows: AssignmentRow[],
): ReceiptItem {
  return {
    id: row.id,
    expenseId: row.expenseId,
    description: row.description,
    unitPrice: row.unitPrice,
    quantity: row.quantity,
    assignment: toItemAssignment(row.assignmentMode, assignmentRows),
  };
}

function toReceiptAdjustment(row: ReceiptAdjustmentRow): ReceiptAdjustment {
  return {
    kind: row.kind,
    amount: row.amount,
    isPercent: row.isPercent,
  };
}

function toExpense(
  row: ExpenseRow,
  items: ReceiptItem[],
  adjustments: ReceiptAdjustment[],
): Expense {
  return {
    id: row.id,
    groupId: row.groupId,
    payerId: row.payerMemberId,
    description: row.description,
    date: row.date,
    receiptImageKey: row.receiptImageKey ?? undefined,
    items,
    adjustments,
    status: row.status,
    merchant: row.merchant ?? undefined,
    currency: row.currency,
  };
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}

/** Anything that exposes `.select` the way `Db` and a `Db` transaction both do. */
type SelectCapable = Pick<Db, "select">;

export class ExpensesRepository {
  static readonly key = "ExpensesRepository";

  private _db?: Db;
  private readonly injectedDb?: Db;

  // Not a parameter-property shorthand: `packages/web` typechecks this file
  // transitively (via its type-only `import { type CoreApi } from
  // "@divvy-up/core"`) under `erasableSyntaxOnly`, which rejects that syntax.
  constructor(injectedDb?: Db) {
    this.injectedDb = injectedDb;
  }

  /** Lazy resolution — `getDb()` must not run at construction time (module import). */
  private get db(): Db {
    if (!this._db) {
      this._db = this.injectedDb ?? getDb();
    }
    return this._db;
  }

  private async hydrateExpense(
    executor: SelectCapable,
    expenseId: string,
  ): Promise<Expense | null> {
    const [expenseRow] = await executor
      .select()
      .from(expenses)
      .where(eq(expenses.id, expenseId));
    if (!expenseRow) return null;

    const itemRows = await executor
      .select()
      .from(receiptItems)
      .where(eq(receiptItems.expenseId, expenseId))
      .orderBy(asc(receiptItems.sortOrder));

    const itemIds = itemRows.map((r) => r.id);
    const assignmentRows =
      itemIds.length > 0
        ? await executor
            .select()
            .from(itemAssignments)
            .where(inArray(itemAssignments.itemId, itemIds))
            // Stable order across reads (id is immutable). Row order carries no
            // semantic weight — each `custom` row is self-contained (memberId +
            // its weight) and the split math is order-independent — but without
            // an explicit ORDER BY the DB could hand back `equal`/`custom` member
            // arrays in a different order between reads of the same expense.
            .orderBy(asc(itemAssignments.id))
        : [];
    const assignmentsByItem: Map<string, AssignmentRow[]> = groupBy(
      assignmentRows,
      (a) => a.itemId,
    );

    const items = itemRows.map((row) =>
      toReceiptItem(row, assignmentsByItem.get(row.id) ?? []),
    );

    const adjustmentRows = await executor
      .select()
      .from(receiptAdjustments)
      .where(eq(receiptAdjustments.expenseId, expenseId));
    const adjustments = adjustmentRows.map(toReceiptAdjustment);

    return toExpense(expenseRow, items, adjustments);
  }

  /** Throws unless `userId` is an active member of `input.groupId` (Req 7.3/7.4) —
   * never distinguishes "group doesn't exist" from "caller isn't a member". */
  async create(userId: string, input: CreateExpenseInput): Promise<Expense> {
    return this.db.transaction(async (tx) => {
      if (!(await isActiveMember(tx, userId, input.groupId))) {
        throw new Error(`Group not found: ${input.groupId}`);
      }

      const activeMembers = await tx
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, input.groupId),
            eq(groupMembers.active, true),
          ),
        );
      const activeMemberIds = new Set(activeMembers.map((m) => m.id));

      if (!activeMemberIds.has(input.payerId)) {
        throw new Error(
          `Payer ${input.payerId} is not an active member of group ${input.groupId}`,
        );
      }

      const parsedItems = input.items.map((item) => ({
        item,
        parsed: parseAssignment(item.assignment),
      }));
      for (const { parsed } of parsedItems) {
        for (const row of parsed.rows) {
          if (!activeMemberIds.has(row.memberId)) {
            throw new Error(
              `Assignment member ${row.memberId} is not an active member of group ${input.groupId}`,
            );
          }
        }
      }

      const [expenseRow] = await tx
        .insert(expenses)
        .values({
          groupId: input.groupId,
          payerMemberId: input.payerId,
          description: input.description,
          date: input.date,
          merchant: input.merchant ?? null,
          currency: input.currency,
          receiptImageKey: input.receiptImageKey ?? null,
          createdBy: userId,
        })
        .returning();

      const items: ReceiptItem[] = [];
      for (let index = 0; index < parsedItems.length; index++) {
        const { item, parsed } = parsedItems[index];
        const [itemRow] = await tx
          .insert(receiptItems)
          .values({
            expenseId: expenseRow.id,
            description: item.description,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            assignmentMode: parsed.mode,
            sortOrder: index,
          })
          .returning();

        if (parsed.rows.length > 0) {
          await tx.insert(itemAssignments).values(
            parsed.rows.map((row) => ({
              itemId: itemRow.id,
              memberId: row.memberId,
              shareWeight: row.shareWeight,
            })),
          );
        }

        items.push(toReceiptItem(itemRow, parsed.rows));
      }

      const adjustments = input.adjustments ?? [];
      for (const adjustment of adjustments) {
        await tx.insert(receiptAdjustments).values({
          expenseId: expenseRow.id,
          kind: adjustment.kind,
          isPercent: adjustment.isPercent,
          amount: adjustment.amount,
        });
      }

      return toExpense(expenseRow, items, adjustments);
    });
  }

  /** Returns null unless `userId` is a member of the expense's group (Req 7.3/7.4). */
  async findById(userId: string, id: string): Promise<Expense | null> {
    if (!isUuid(id)) return null;
    const expense = await this.hydrateExpense(this.db, id);
    if (!expense) return null;
    if (!(await isActiveMember(this.db, userId, expense.groupId))) return null;
    return expense;
  }

  /** Returns [] unless `userId` is a member of `groupId` (Req 7.3/7.4). */
  async listByGroup(userId: string, groupId: string): Promise<Expense[]> {
    if (!isUuid(groupId)) return [];
    if (!(await isActiveMember(this.db, userId, groupId))) return [];

    const expenseRows = await this.db
      .select()
      .from(expenses)
      .where(eq(expenses.groupId, groupId))
      .orderBy(asc(expenses.createdAt));
    if (expenseRows.length === 0) return [];

    const expenseIds = expenseRows.map((e) => e.id);
    const itemRows = await this.db
      .select()
      .from(receiptItems)
      .where(inArray(receiptItems.expenseId, expenseIds))
      .orderBy(asc(receiptItems.sortOrder));

    const itemIds = itemRows.map((i) => i.id);
    const assignmentRows =
      itemIds.length > 0
        ? await this.db
            .select()
            .from(itemAssignments)
            .where(inArray(itemAssignments.itemId, itemIds))
            .orderBy(asc(itemAssignments.id)) // stable across reads — see hydrateExpense
        : [];

    const adjustmentRows = await this.db
      .select()
      .from(receiptAdjustments)
      .where(inArray(receiptAdjustments.expenseId, expenseIds));

    const assignmentsByItem = groupBy(assignmentRows, (a) => a.itemId);
    const itemsByExpense = groupBy(itemRows, (i) => i.expenseId);
    const adjustmentsByExpense = groupBy(adjustmentRows, (a) => a.expenseId);

    return expenseRows.map((expenseRow) => {
      const items = (itemsByExpense.get(expenseRow.id) ?? []).map((row) =>
        toReceiptItem(row, assignmentsByItem.get(row.id) ?? []),
      );
      const adjustments = (adjustmentsByExpense.get(expenseRow.id) ?? []).map(
        toReceiptAdjustment,
      );
      return toExpense(expenseRow, items, adjustments);
    });
  }

  /** Returns null unless `userId` is a member of the expense's group (Req 7.3/7.4). */
  async updateItemAssignment(
    userId: string,
    expenseId: string,
    itemId: string,
    assignment: ItemAssignment,
  ): Promise<Expense | null> {
    if (!isUuid(expenseId) || !isUuid(itemId)) return null;

    const parsed = parseAssignment(assignment);

    return this.db.transaction(async (tx) => {
      const [expenseRow] = await tx
        .select()
        .from(expenses)
        .where(eq(expenses.id, expenseId));
      if (!expenseRow) return null;
      if (!(await isActiveMember(tx, userId, expenseRow.groupId))) return null;

      const [itemRow] = await tx
        .select()
        .from(receiptItems)
        .where(
          and(
            eq(receiptItems.id, itemId),
            eq(receiptItems.expenseId, expenseId),
          ),
        );
      if (!itemRow) return null;

      if (parsed.rows.length > 0) {
        const activeMembers = await tx
          .select({ id: groupMembers.id })
          .from(groupMembers)
          .where(
            and(
              eq(groupMembers.groupId, expenseRow.groupId),
              eq(groupMembers.active, true),
            ),
          );
        const activeMemberIds = new Set(activeMembers.map((m) => m.id));
        for (const row of parsed.rows) {
          if (!activeMemberIds.has(row.memberId)) {
            throw new Error(
              `Assignment member ${row.memberId} is not an active member of group ${expenseRow.groupId}`,
            );
          }
        }
      }

      await tx
        .update(receiptItems)
        .set({ assignmentMode: parsed.mode })
        .where(eq(receiptItems.id, itemId));

      await tx
        .delete(itemAssignments)
        .where(eq(itemAssignments.itemId, itemId));

      if (parsed.rows.length > 0) {
        await tx.insert(itemAssignments).values(
          parsed.rows.map((row) => ({
            itemId,
            memberId: row.memberId,
            shareWeight: row.shareWeight,
          })),
        );
      }

      await tx
        .update(expenses)
        .set({ updatedAt: new Date() })
        .where(eq(expenses.id, expenseId));

      return this.hydrateExpense(tx, expenseId);
    });
  }

  /** Returns null unless `userId` is a member of the expense's group (Req 7.3/7.4). */
  async finalize(userId: string, expenseId: string): Promise<Expense | null> {
    if (!isUuid(expenseId)) return null;

    return this.db.transaction(async (tx) => {
      const [expenseRow] = await tx
        .select({ groupId: expenses.groupId })
        .from(expenses)
        .where(eq(expenses.id, expenseId));
      if (!expenseRow) return null;
      if (!(await isActiveMember(tx, userId, expenseRow.groupId))) return null;

      // Guard the transition on `status = 'draft'` so finalize is idempotent:
      // re-finalizing (double-tap, client retry, or re-hitting the endpoint to
      // refresh balances) matches zero rows here and must NOT emit a second
      // `expense_added` — the forward-only feed would otherwise accrue duplicate
      // rows for one expense.
      const [row] = await tx
        .update(expenses)
        .set({ status: "finalized", updatedAt: new Date() })
        .where(and(eq(expenses.id, expenseId), eq(expenses.status, "draft")))
        .returning({ id: expenses.id });

      const expense = await this.hydrateExpense(tx, expenseId);
      if (!expense) return null; // vanished mid-transaction → 404
      // Already finalized: return current state, but don't re-emit the feed row.
      if (!row) return expense;

      // Emit `expense_added` atomically with the finalize — finalizing is the
      // moment the expense counts toward balances, so it's the feed-worthy event.
      // The actor is the finalizing user's member row; a missing actor (should
      // not happen — finalize is membership-gated above) skips the feed row
      // rather than aborting a valid finalize.
      const actor = await resolveActorMember(tx, userId, expenseRow.groupId);
      if (actor) {
        await recordActivity(tx, {
          groupId: expenseRow.groupId,
          actorMemberId: actor.id,
          kind: "expense_added",
          text: activityText.expenseAdded(
            actor.name,
            expense.description,
            expenseTotalPence(expense),
          ),
          amount: expenseTotalPence(expense),
          expenseId: expense.id,
        });
      }

      return expense;
    });
  }

  _clearStore(): void {
    throw new Error(
      "_clearStore is test-only; the vitest setup swaps in the in-memory double",
    );
  }
}
