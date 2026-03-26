import type { Expense, ItemAssignment } from "../../domain/types";

type CreateExpenseInput = Omit<
  Expense,
  "id" | "items" | "adjustments" | "status"
> & {
  items: Omit<Expense["items"][number], "id" | "expenseId">[];
  adjustments?: Expense["adjustments"];
};

export class ExpensesRepository {
  static readonly key = "ExpensesRepository";

  /** In-memory store — stands in for Postgres until DB is wired */
  private readonly store = new Map<string, Expense>();

  async create(input: CreateExpenseInput): Promise<Expense> {
    // TODO: insert into Postgres
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
    // TODO: query Postgres
    return this.store.get(id) ?? null;
  }

  async listByGroup(groupId: string): Promise<Expense[]> {
    // TODO: query Postgres
    return [...this.store.values()].filter((e) => e.groupId === groupId);
  }

  async updateItemAssignment(
    expenseId: string,
    itemId: string,
    assignment: ItemAssignment,
  ): Promise<Expense | null> {
    // TODO: update in Postgres
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
    // TODO: update in Postgres
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
