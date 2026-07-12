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

  /** Test-only: register `userId` as an active member of `groupId`. */
  _addMember(groupId: string, userId: string): void {
    const members = this.membersByGroup.get(groupId) ?? new Set<string>();
    members.add(userId);
    this.membersByGroup.set(groupId, members);
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
    const updated: Expense = {
      ...expense,
      items: expense.items.map((item) =>
        item.id === itemId ? { ...item, assignment } : item,
      ),
    };
    this.store.set(expenseId, updated);
    return updated;
  }

  async finalize(userId: string, expenseId: string): Promise<Expense | null> {
    const expense = this.store.get(expenseId);
    if (!expense) return null;
    if (!this.isMember(userId, expense.groupId)) return null;
    const finalized: Expense = { ...expense, status: "finalized" };
    this.store.set(expenseId, finalized);
    return finalized;
  }

  /** Test helper — clears the store between tests */
  _clearStore(): void {
    this.store.clear();
    this.membersByGroup.clear();
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
