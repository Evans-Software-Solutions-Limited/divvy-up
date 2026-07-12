// In-memory double for ExpensesRepository, used by the handler tests via the
// vitest.setup.ts module mock. This is the CURRENT (pre-Postgres) Map-store
// implementation, moved verbatim — those tests seed via non-UUID fixture ids
// ("group-1", "member-1") and fractional custom shares, and can never run
// against real FK/uuid columns. Repository correctness against the real
// schema is covered separately by the PGlite-backed *.pg.test.ts suites.
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

  async create(input: CreateExpenseInput): Promise<Expense> {
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

  async findById(id: string): Promise<Expense | null> {
    return this.store.get(id) ?? null;
  }

  async listByGroup(groupId: string): Promise<Expense[]> {
    return [...this.store.values()].filter((e) => e.groupId === groupId);
  }

  async updateItemAssignment(
    expenseId: string,
    itemId: string,
    assignment: ItemAssignment,
  ): Promise<Expense | null> {
    const expense = this.store.get(expenseId);
    if (!expense) return null;
    const updated: Expense = {
      ...expense,
      items: expense.items.map((item) =>
        item.id === itemId ? { ...item, assignment } : item,
      ),
    };
    this.store.set(expenseId, updated);
    return updated;
  }

  async finalize(expenseId: string): Promise<Expense | null> {
    const expense = this.store.get(expenseId);
    if (!expense) return null;
    const finalized: Expense = { ...expense, status: "finalized" };
    this.store.set(expenseId, finalized);
    return finalized;
  }

  /** Test helper — clears the store between tests */
  _clearStore(): void {
    this.store.clear();
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
