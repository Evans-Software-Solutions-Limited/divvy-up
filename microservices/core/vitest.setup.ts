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

vi.mock("./src/application/repositories/settlementsRepository", async () => {
  const { InMemorySettlementsRepository } =
    await import("./src/application/repositories/__tests__/support/inMemorySettlementsRepository");
  return {
    SettlementsRepository: InMemorySettlementsRepository,
    settlementsRepo: new InMemorySettlementsRepository(),
  };
});

vi.mock("./src/application/repositories/groupInvitesRepository", async () => {
  const { InMemoryGroupInvitesRepository } =
    await import("./src/application/repositories/__tests__/support/inMemoryGroupInvitesRepository");
  return {
    GroupInvitesRepository: InMemoryGroupInvitesRepository,
    groupInvitesRepo: new InMemoryGroupInvitesRepository(),
  };
});

// Only the READ repo is swapped for the in-memory double. `recordActivity` /
// `activityText` are preserved from the real module: the emit-site repositories
// (expenses/settlements/groups/invites) import them, and the PGlite suites load
// those repos via `vi.importActual`, so the write path must stay real to insert
// actual rows. Handler tests never invoke the write path (their emit-site repos
// are in-memory doubles), so keeping it real there is harmless.
vi.mock(
  "./src/application/repositories/activityRepository",
  async (importActual) => {
    const actual =
      await importActual<
        typeof import("./src/application/repositories/activityRepository")
      >();
    const { InMemoryActivityRepository } =
      await import("./src/application/repositories/__tests__/support/inMemoryActivityRepository");
    return {
      ...actual,
      ActivityRepository: InMemoryActivityRepository,
      activityRepo: new InMemoryActivityRepository(),
    };
  },
);
