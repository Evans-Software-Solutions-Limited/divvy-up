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
      // A DRAFT `everyone` item stores no member rows: it means "whoever is in
      // the group", resolved live for the draft preview. `finalize` materialises
      // it into explicit `equal` rows — see `freezeEveryoneItems`.
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

/**
 * Did an item's split actually change **in a way that moves money**? Compares the
 * stored participant rows with what is about to be written.
 *
 * Used to keep a no-op re-save — opening the editor on a finalized item and
 * pressing save without touching anything — from manufacturing a feed row that
 * claims money moved when it didn't.
 *
 * What's compared, and why that's the whole of it:
 * - **Not row order.** Each row is self-contained (member + weight) and the split
 *   math is order-independent, so a set comparison is the right shape. (The rows
 *   are still read in `assignmentRowOrder`, because the same rows get rendered
 *   into the audit text, where order does show.)
 * - **Not the mode.** What the mode does is determine the weights, and the
 *   weights are compared directly: `null` (as `one`/`equal` store it) means
 *   weight 1, which is why it's normalised to `1` in the key. So an `equal` split
 *   over [A,B] and a `custom` split of 0.5/0.5 over [A,B] compare EQUAL — they
 *   are the same pennies, and re-labelling them moved nothing. Likewise
 *   `one` over [A] and `equal` over [A].
 * - Duplicate members can't occur: `item_assignments` has a unique index on
 *   (item_id, member_id), so equal length plus subset implies set equality.
 */
function splitChanged(
  previousRows: AssignmentRow[],
  next: ParsedAssignment,
): boolean {
  if (previousRows.length !== next.rows.length) return true;
  // `?? 1`, not `?? ""`: a null weight IS weight 1, so modes that differ only in
  // how they spell an even split aren't reported as a money movement.
  const key = (r: AssignmentRow) => `${r.memberId}:${r.shareWeight ?? 1}`;
  const before = new Set(previousRows.map(key));
  return next.rows.some((r) => !before.has(key(r)));
}

/**
 * Human-readable "who was on this item, and in what proportion", for the audit
 * text. Names are resolved by the caller inside its transaction and snapshotted
 * into the feed row, so the entry still reads correctly after a rename or a
 * removal. (A removed member still resolves: removal is a soft delete, and the FKs
 * are `restrict`, so the fallback string is effectively unreachable.)
 *
 * Two things this must NOT do, because the row's whole job is to let someone
 * reconcile a changed debt:
 * - **Drop the weights.** A `custom` re-split can keep the same people and move
 *   money between them (0.5/0.5 → 0.9/0.1), which would otherwise render an
 *   identical "was" and "now" while £9 of £10 moved.
 * - **Truncate the list.** Two different 5-way splits that share their first two
 *   members would both render "Alice, Bob +3 more". Splits are bounded by group
 *   size in practice, so every name is listed.
 *
 * Rendered in NAME order, not row order. Row order is member-id order, and member
 * ids are random uuids — fine for the split maths (where it only needs to be
 * stable) but arbitrary in prose. Sorting by name makes "was …, now …" line up
 * for a human comparing the two, and makes the text reproducible.
 */
function describeParticipants(
  mode: AssignmentModeValue | null,
  rows: AssignmentRow[],
  names: Map<string, string>,
): string {
  if (mode === null) return "unassigned";
  if (mode === "everyone") return "everyone";
  if (rows.length === 0) return "nobody";
  return (
    rows
      .map((r) => ({
        memberId: r.memberId,
        name: names.get(r.memberId) ?? "a removed member",
        // Weights only mean anything for `custom`; the others are all-equal shares.
        weight: mode === "custom" ? r.shareWeight : null,
      }))
      // Names aren't unique (two Sams, or a placeholder mirroring a real member's
      // name), so tie-break on member id — otherwise the two sides fall back to
      // their own input orders and the line implies a swap that didn't happen.
      // Locale pinned: bare `localeCompare` follows the runtime's locale and ICU
      // build, so a non-ASCII name could order differently in CI than locally.
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name, "en") ||
          a.memberId.localeCompare(b.memberId),
      )
      .map((e) => (e.weight === null ? e.name : `${e.name} ×${e.weight}`))
      .join(", ")
  );
}

/**
 * The order every read of `item_assignments` uses: by MEMBER id.
 *
 * Row order is not cosmetic: `computeBalances` feeds the member list straight
 * into `splitPence`, whose largest-remainder tie-break gives the odd penny to
 * the EARLIEST participants. So the order rows come back in decides who pays
 * the extra penny of a £10-across-3 item.
 *
 * `item_assignments.id` is a random uuid, so ordering by it would make that a
 * coin flip per expense — and, worse, a *different* coin flip from the order the
 * members were resolved in when `finalize` froze them, which is what would make
 * the freeze shift a penny relative to the split the user just reviewed.
 * `member_id` is the one key both sides share: `activeMemberIds` resolves
 * members in `id` order, so a frozen split hydrates in exactly the order it was
 * written. (Postgres compares uuids bytewise, which matches a lexicographic sort
 * of their canonical lowercase-hex text form — so clients can reproduce it.)
 */
const assignmentRowOrder = asc(itemAssignments.memberId);

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

  /**
   * Active member ids of `groupId`, in a deterministic order (`id` ascending).
   *
   * The order matters: it becomes the participant order of a frozen `everyone`
   * split, and `splitPence`'s largest-remainder tie-break hands the odd penny
   * to the earliest participants. Ordering here keeps a freeze reproducible
   * rather than dependent on Postgres' physical row order.
   */
  private async activeMemberIds(
    executor: SelectCapable,
    groupId: string,
  ): Promise<string[]> {
    const rows = await executor
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(
        and(eq(groupMembers.groupId, groupId), eq(groupMembers.active, true)),
      )
      .orderBy(asc(groupMembers.id));
    return rows.map((r) => r.id);
  }

  /** Display names for the given member ids, for snapshotting into feed text. */
  private async memberNames(
    executor: SelectCapable,
    memberIds: string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(memberIds)];
    if (unique.length === 0) return new Map();
    const rows = await executor
      .select({ id: groupMembers.id, name: groupMembers.name })
      .from(groupMembers)
      .where(inArray(groupMembers.id, unique));
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  /**
   * Freeze every `everyone` item of `expenseId` into an explicit `equal` split
   * over the group's active members **as of now**.
   *
   * Why: `everyone` carries no `item_assignments` rows, so it can only be
   * resolved against a member list supplied at read time. For a FINALIZED
   * (immutable) expense that made its balances silently drift whenever
   * membership changed — a member added next week retroactively owed a share of
   * last week's dinner, and the original diners' shares shrank. Materialising
   * the participant set makes a finalized expense self-describing and therefore
   * membership-independent for good.
   *
   * Representation: mode flips `everyone` → `equal` with one row per member,
   * rather than keeping the `everyone` mode alongside snapshot rows. `equal`
   * already means exactly "these N people, evenly", so nothing downstream needs
   * to learn a second way to read a frozen split — and no finalized expense is
   * left carrying a mode that begs to be resolved at read time.
   *
   * The numbers don't move: `equal` and `everyone` take the same code path in
   * `computeBalances` (all-1 weights over the participant list), and the frozen
   * rows hydrate in the same `member_id` order they were resolved in (see
   * `assignmentRowOrder` — without that agreement the largest-remainder odd
   * penny would land on a different member after freezing).
   *
   * Callers must invoke this INSIDE the finalize transaction and only on the
   * guarded draft→finalized transition, so a rolled-back finalize leaves no
   * frozen rows and a re-finalize freezes nothing twice.
   */
  private async freezeEveryoneItems(
    executor: SelectCapable & Pick<Db, "insert" | "update">,
    expenseId: string,
    groupId: string,
  ): Promise<void> {
    const everyoneItems = await executor
      .select({ id: receiptItems.id })
      .from(receiptItems)
      .where(
        and(
          eq(receiptItems.expenseId, expenseId),
          eq(receiptItems.assignmentMode, "everyone"),
        ),
      );
    if (everyoneItems.length === 0) return;

    const memberIds = await this.activeMemberIds(executor, groupId);

    for (const item of everyoneItems) {
      // An `everyone` item provably has no rows yet (both writers delete them),
      // so a plain insert is right — a unique violation here would mean corrupt
      // data and correctly aborts the finalize.
      if (memberIds.length > 0) {
        await executor.insert(itemAssignments).values(
          memberIds.map((memberId) => ({
            itemId: item.id,
            memberId,
            shareWeight: null,
          })),
        );
      }
      // No active members (not reachable via finalize, which is membership-
      // gated): `equal` with zero rows is the same no-op in the split math that
      // `everyone` against an empty list was.
      await executor
        .update(receiptItems)
        .set({ assignmentMode: "equal" })
        .where(eq(receiptItems.id, item.id));
    }
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
            .orderBy(assignmentRowOrder)
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

      const activeMemberIds = new Set(
        await this.activeMemberIds(tx, input.groupId),
      );

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
            .orderBy(assignmentRowOrder)
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

  /**
   * Re-assigns one item. Returns null unless `userId` is a member of the
   * expense's group (Req 7.3/7.4).
   *
   * ── Editing a FINALIZED expense is allowed, and logged ──────────────────────
   * Finalizing means "this expense now counts toward balances", NOT "this expense
   * is frozen forever". Assignment edits stay open afterwards because they are
   * the only way to fix a mis-assigned receipt: there is no delete-expense and no
   * un-finalize endpoint, so rejecting the edit would leave a wrong split wrong
   * permanently, and the only workaround — a compensating expense or settlement —
   * misstates what actually happened.
   *
   * The real defect was that such an edit was *silent*: it rewrote who owes whom
   * on an expense that may already have settlements recorded against it, with
   * nothing in the feed. So an edit to a finalized expense now emits
   * `expense_split_changed`, in this same transaction, whenever the split
   * materially changes. Draft edits emit nothing — assigning items is the normal
   * draft workflow.
   *
   * What finalizing DOES freeze is the participant set of an `everyone` split
   * (see `freezeEveryoneItems`): that's about balances drifting on their own as
   * membership changes, which is a different thing from a person deliberately
   * correcting a split. An `everyone` assignment made here on a finalized expense
   * is therefore materialised on the spot rather than rejected.
   */
  async updateItemAssignment(
    userId: string,
    expenseId: string,
    itemId: string,
    assignment: ItemAssignment,
  ): Promise<Expense | null> {
    if (!isUuid(expenseId) || !isUuid(itemId)) return null;

    const parsed = parseAssignment(assignment);

    return this.db.transaction(async (tx) => {
      // Locked because the freeze decision below turns on `status`, and a
      // concurrent `finalize` moves it. Without the lock (READ COMMITTED): this
      // transaction reads `draft`, finalize commits, then this one writes an
      // `everyone` mode onto a now-finalized expense — leaving a finalized
      // expense with no participants, whose item silently drops out of balances.
      // Locking makes the two serialise: whichever runs second sees the other's
      // committed state and either freezes here or freezes in finalize.
      //
      // `no key update` rather than `update`: it still conflicts with finalize's
      // `UPDATE`, but not with the `FOR KEY SHARE` locks taken by inserts that
      // reference this row (an `activity` row's `expense_id`, say).
      const [expenseRow] = await tx
        .select()
        .from(expenses)
        .where(eq(expenses.id, expenseId))
        .for("no key update");
      if (!expenseRow) return null;
      // Resolved once, up front, and used both as the membership gate and as the
      // author of the audit row below — `resolveActorMember` runs exactly the
      // `isActiveMember` predicate. Resolving it after the writes instead would
      // leave a window (READ COMMITTED, and only the `expenses` row is locked)
      // where the acting member is deactivated mid-transaction, the emit is
      // skipped for want of an actor, and the rewrite commits unlogged.
      const actor = await resolveActorMember(tx, userId, expenseRow.groupId);
      if (!actor) return null;

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

      const wasFinalized = expenseRow.status === "finalized";

      // Assigning `everyone` on an ALREADY-FINALIZED expense freezes on the
      // spot, for the same reason `finalize` does: a finalized expense must
      // never be left carrying a membership-dependent split, or its balances
      // start drifting again.
      const freezeNow = parsed.mode === "everyone" && wasFinalized;

      // The split as it stands, captured BEFORE the rewrite below, so a
      // no-op re-save of a finalized item doesn't manufacture a feed row.
      const previousRows = wasFinalized
        ? await tx
            .select({
              memberId: itemAssignments.memberId,
              shareWeight: itemAssignments.shareWeight,
            })
            .from(itemAssignments)
            .where(eq(itemAssignments.itemId, itemId))
            // Ordered, because these rows don't only feed the set comparison —
            // they're also rendered into the audit text, where physical row order
            // would otherwise decide the name sequence. Ordering both sides the
            // same way makes "was X, now Y" comparable at a glance.
            .orderBy(assignmentRowOrder)
        : [];

      // What actually gets written: `parsed`, except a finalized `everyone`
      // becomes the frozen `equal` set.
      let effective = parsed;

      if (parsed.rows.length > 0 || freezeNow) {
        const activeIds = await this.activeMemberIds(tx, expenseRow.groupId);
        const activeMemberIds = new Set(activeIds);
        for (const row of parsed.rows) {
          if (!activeMemberIds.has(row.memberId)) {
            throw new Error(
              `Assignment member ${row.memberId} is not an active member of group ${expenseRow.groupId}`,
            );
          }
        }
        if (freezeNow) {
          effective = {
            mode: "equal",
            rows: activeIds.map((memberId) => ({
              memberId,
              shareWeight: null,
            })),
          };
        }
      }

      await tx
        .update(receiptItems)
        .set({ assignmentMode: effective.mode })
        .where(eq(receiptItems.id, itemId));

      await tx
        .delete(itemAssignments)
        .where(eq(itemAssignments.itemId, itemId));

      if (effective.rows.length > 0) {
        await tx.insert(itemAssignments).values(
          effective.rows.map((row) => ({
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

      // Editing a FINALIZED expense rewrites who owes whom — the expense is
      // already counting toward balances, and a settlement may already have been
      // recorded against the old numbers. That's allowed (see the method doc:
      // it's the only way to fix a mis-assigned receipt) but it gets a feed row,
      // emitted in this same transaction so a committed edit always has its
      // audit trail. Draft edits emit nothing: assigning items is the normal
      // draft workflow and would bury the feed.
      if (wasFinalized && splitChanged(previousRows, effective)) {
        // Name both sides of the move. Without them the row says only "something
        // changed", which is not enough to tell whether a settlement already
        // recorded against the old split still corresponds to a debt — the very
        // reconciliation this row exists for.
        const names = await this.memberNames(tx, [
          ...previousRows.map((r) => r.memberId),
          ...effective.rows.map((r) => r.memberId),
        ]);
        await recordActivity(tx, {
          groupId: expenseRow.groupId,
          actorMemberId: actor.id,
          kind: "expense_split_changed",
          text: activityText.expenseSplitChanged(actor.name, {
            item: itemRow.description,
            expense: expenseRow.description,
            before: describeParticipants(
              itemRow.assignmentMode,
              previousRows,
              names,
            ),
            after: describeParticipants(effective.mode, effective.rows, names),
          }),
          // The item's own value — what was at stake in this re-split, NOT a
          // transfer. `amount` is display metadata throughout the feed and never
          // an input to balance math.
          amount: itemRow.unitPrice * itemRow.quantity,
          expenseId,
        });
      }

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

      // Freeze `everyone` splits into explicit members BEFORE hydrating, so the
      // returned expense (and the balances the caller derives from it) already
      // reflect the frozen participant set. Inside the transition guard, so a
      // re-finalize can't double-insert and a rolled-back finalize freezes
      // nothing.
      if (row) {
        await this.freezeEveryoneItems(tx, expenseId, expenseRow.groupId);
      }

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
