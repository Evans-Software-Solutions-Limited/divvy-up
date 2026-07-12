import { vi } from "vitest";

// Handler/service tests seed via the repo singletons with non-UUID fixture
// ids ("group-1", "member-1") and fractional custom shares — they can never
// run against real FK/uuid Postgres columns. Swap in the in-memory doubles so
// those tests keep proving the interface held, with no live DB and no env
// vars. Repository correctness against the real schema is proven separately
// by the PGlite-backed *.pg.test.ts suites, which use `vi.importActual` to
// bypass this mock.
vi.mock("./src/application/repositories/groupsRepository", async () => {
  const { InMemoryGroupsRepository } =
    await import("./src/application/repositories/__tests__/support/inMemoryGroupsRepository");
  return {
    GroupsRepository: InMemoryGroupsRepository,
    groupsRepo: new InMemoryGroupsRepository(),
  };
});

vi.mock("./src/application/repositories/expensesRepository", async () => {
  const { InMemoryExpensesRepository } =
    await import("./src/application/repositories/__tests__/support/inMemoryExpensesRepository");
  return { ExpensesRepository: InMemoryExpensesRepository };
});
