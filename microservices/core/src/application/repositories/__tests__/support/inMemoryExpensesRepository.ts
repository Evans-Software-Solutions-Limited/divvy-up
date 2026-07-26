// In-memory double for ExpensesRepository, used by the handler tests via the
// vitest.setup.ts module mock. This is the CURRENT (pre-Postgres) Map-store
// implementation, moved verbatim — those tests seed via non-UUID fixture ids
// ("group-1", "member-1") and fractional custom shares, and can never run
// against real FK/uuid columns. Repository correctness against the real
// schema is covered separately by the PGlite-backed *.pg.test.ts suites.
//
// Ownership scoping (data-and-persistence Requirement 7): this double has no
// shared state with InMemoryGroupsRepository, so it tracks its own
// group→members map, seeded via the test-only `_addMember` — mirroring the
// real repo's `group_members` membership check without a live DB.
import type { ExpensesRepository } from "../../expensesRepository";
import type { Expense, ItemAssignment } from "../../../../domain/types";

type CreateExpenseInput = Omit<
  Expense,
  "id" | "items" | "adjustments" | "status"
> & {
  items: Omit<Expense["items"][number], "id" | "expenseId">[];
  adjustments?: Expense["adjustments"];
};

export class InMemoryExpensesRepository {
  static readonly key = "ExpensesRepository";

  /** In-memory store — stands in for Postgres until DB is wired */
  private readonly store = new Map<string, Expense>();
  private readonly membersByGroup = new Map<string, Set<string>>();
  private readonly memberIdsByGroup = new Map<string, string[]>();

  /** Test-only: register `userId` as an active member of `groupId`. */
  _addMember(groupId: string, userId: string): void {
    const members = this.membersByGroup.get(groupId) ?? new Set<string>();
    members.add(userId);
    this.membersByGroup.set(groupId, members);
  }

  /**
   * Test-only: the group's `group_members` ids — the roster `finalize` freezes
   * an `everyone` split over. Distinct from `_addMember`, which registers the
   * *user* ids used for the ownership check.
   */
  _setGroupMemberIds(groupId: string, memberIds: string[]): void {
    this.memberIdsByGroup.set(groupId, memberIds);
  }

  private isMember(userId: string, groupId: string): boolean {
    return this.membersByGroup.get(groupId)?.has(userId) ?? false;
  }

  async create(userId: string, input: CreateExpenseInput): Promise<Expense> {
    if (!this.isMember(userId, input.groupId)) {
      throw new Error(`Group not found: ${input.groupId}`);
    }
    const id = crypto.randomUUID();
    const expense: Expense = {
      ...input,
      id,
      status: "draft",
      items: input.items.map((item) => ({
        ...item,
        id: crypto.randomUUID(),
        expenseId: id,
      })),
      adjustments: input.adjustments ?? [],
    };
    this.store.set(id, expense);
    return expense;
  }

  async findById(userId: string, id: string): Promise<Expense | null> {
    const expense = this.store.get(id) ?? null;
    if (!expense) return null;
    if (!this.isMember(userId, expense.groupId)) return null;
    return expense;
  }

  async listByGroup(userId: string, groupId: string): Promise<Expense[]> {
    if (!this.isMember(userId, groupId)) return [];
    return [...this.store.values()].filter((e) => e.groupId === groupId);
  }

  async updateItemAssignment(
    userId: string,
    expenseId: string,
    itemId: string,
    assignment: ItemAssignment,
  ): Promise<Expense | null> {
    const expense = this.store.get(expenseId);
    if (!expense) return null;
    if (!this.isMember(userId, expense.groupId)) return null;
    // The real repository freezes here too, not just in `finalize`: setting
    // `everyone` on an already-finalized expense would otherwise leave it with a
    // membership-dependent split.
    const effective: ItemAssignment =
      assignment.type === "everyone" && expense.status === "finalized"
        ? { type: "equal", memberIds: this.frozenMemberIds(expense.groupId) }
        : assignment;
    const updated: Expense = {
      ...expense,
      items: expense.items.map((item) =>
        item.id === itemId ? { ...item, assignment: effective } : item,
      ),
    };
    this.store.set(expenseId, updated);
    return updated;
  }

  /**
   * The roster an `everyone` split freezes over, in the same member-id order the
   * real repository resolves and re-reads it in.
   *
   * Throws when unset: the real repository can never freeze over an empty roster
   * (finalize is membership-gated), and freezing to an empty `equal` split would
   * silently zero the balances — letting a test "pass" by asserting nothing.
   */
  private frozenMemberIds(groupId: string): string[] {
    const memberIds = this.memberIdsByGroup.get(groupId) ?? [];
    if (memberIds.length === 0) {
      throw new Error(
        `InMemoryExpensesRepository: no member roster for group ${groupId} — call _setGroupMemberIds() before finalizing an "everyone" expense`,
      );
    }
    return [...memberIds].sort();
  }

  async finalize(userId: string, expenseId: string): Promise<Expense | null> {
    const expense = this.store.get(expenseId);
    if (!expense) return null;
    if (!this.isMember(userId, expense.groupId)) return null;
    // Already finalized: return as-is, mirroring the real repo's draft-only
    // transition guard (so a re-finalize can't re-freeze against a roster that
    // has changed since).
    if (expense.status === "finalized") return expense;

    // Freeze `everyone` items into an explicit equal split, as the real
    // repository does — a finalized expense must never be left with a
    // membership-dependent split.
    const hasEveryone = expense.items.some(
      (item) => item.assignment.type === "everyone",
    );
    const memberIds = hasEveryone ? this.frozenMemberIds(expense.groupId) : [];
    const finalized: Expense = {
      ...expense,
      status: "finalized",
      items: expense.items.map((item) =>
        item.assignment.type === "everyone"
          ? { ...item, assignment: { type: "equal", memberIds } }
          : item,
      ),
    };
    this.store.set(expenseId, finalized);
    return finalized;
  }

  /** Test helper — clears the store between tests */
  _clearStore(): void {
    this.store.clear();
    this.membersByGroup.clear();
    // Also the freeze roster — a roster leaking into a later test would let it
    // finalize an `everyone` expense it never declared members for, defeating
    // the guard in `frozenMemberIds` and failing confusingly under `.only`.
    this.memberIdsByGroup.clear();
  }
}

// Structural compatibility check — the double must satisfy the real
// repository's public instance surface (constructor differs deliberately:
// the real class takes an optional injected `Db`).
type PublicSurface = Pick<
  ExpensesRepository,
  | "create"
  | "findById"
  | "listByGroup"
  | "updateItemAssignment"
  | "finalize"
  | "_clearStore"
>;
const _typeCheck: PublicSurface = new InMemoryExpensesRepository();
void _typeCheck;
