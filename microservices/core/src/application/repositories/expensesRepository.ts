import type { Expense } from "../../domain/types";

type CreateExpenseInput = Omit<Expense, "id" | "items" | "adjustments"> & {
  items: Omit<Expense["items"][number], "id" | "expenseId">[];
  adjustments?: Expense["adjustments"];
};

export class ExpensesRepository {
  static readonly key = "ExpensesRepository";

  async create(input: CreateExpenseInput): Promise<Expense> {
    // TODO: insert into Postgres
    const id = crypto.randomUUID();
    return {
      ...input,
      id,
      items: input.items.map((item) => ({
        ...item,
        id: crypto.randomUUID(),
        expenseId: id,
      })),
      adjustments: input.adjustments ?? [],
    };
  }

  async findById(id: string): Promise<Expense | null> {
    // TODO: query Postgres
    void id;
    return null;
  }

  async listByGroup(groupId: string): Promise<Expense[]> {
    // TODO: query Postgres
    void groupId;
    return [];
  }
}
