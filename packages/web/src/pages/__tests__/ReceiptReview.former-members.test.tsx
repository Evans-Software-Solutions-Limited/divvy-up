// The group payload carries members who have been removed (`active: false`) so
// their frozen debts can still be named. This screen must therefore keep two
// lists apart: who an item can be ASSIGNED to (current members only — the server
// rejects an assignment naming a removed member) versus who can be NAMED (the
// full roster, so a split frozen before someone left still shows their avatar).
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UseQueryResult } from "@tanstack/react-query";
import { ReceiptReview } from "../ReceiptReview";
import { useGetExpense } from "@/hooks/api/useGetExpense";
import { useGetGroup } from "@/hooks/api/useGetGroup";

vi.mock("@/hooks/api/useGetExpense");
vi.mock("@/hooks/api/useGetGroup");
vi.mock("@/hooks/api/useUpdateItemAssignment", () => ({
  useUpdateItemAssignment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/api/useFinalizeExpense", () => ({
  useFinalizeExpense: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const mockUseGetExpense = vi.mocked(useGetExpense);
const mockUseGetGroup = vi.mocked(useGetGroup);

const EXPENSE_ID = "exp-1";
const GROUP_ID = "group-1";

const ALICE = { id: "m-alice", name: "Alice", active: true, colourIndex: 0 };
const BOB = { id: "m-bob", name: "Bob", active: true, colourIndex: 1 };
/** Left the group after this expense's items were assigned. */
const CARA_FORMER = {
  id: "m-cara",
  name: "Cara",
  active: false,
  colourIndex: 2,
};

/** One £9 item, assigned however the test needs. */
function mockData(
  members: Array<Record<string, unknown>>,
  assignment: unknown = { type: "everyone" },
) {
  mockUseGetExpense.mockReturnValue({
    isLoading: false,
    data: {
      id: EXPENSE_ID,
      groupId: GROUP_ID,
      description: "Dinner",
      date: "2026-07-26",
      status: "draft",
      payerId: ALICE.id,
      currency: "GBP",
      adjustments: [],
      items: [
        {
          id: "item-1",
          description: "Sharing platter",
          unitPrice: 900,
          quantity: 1,
          assignment,
        },
      ],
    },
  } as unknown as UseQueryResult<unknown>);
  mockUseGetGroup.mockReturnValue({
    isLoading: false,
    data: { id: GROUP_ID, name: "Trip", createdAt: "", members },
  } as unknown as UseQueryResult<unknown>);
}

function renderReview() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[`/expenses/${EXPENSE_ID}/review`]}>
        <Routes>
          <Route path="/expenses/:id/review" element={<ReceiptReview />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ReceiptReview — members who have left the group", () => {
  it("splits an 'everyone' item over current members only", () => {
    // £9 over Alice and Bob = £4.50 each. If Cara were counted it would be £3.00
    // each — and the server, which freezes over active members at finalize,
    // would then disagree with what this screen showed.
    mockData([ALICE, BOB, CARA_FORMER]);

    renderReview();

    expect(screen.getAllByText("£4.50").length).toBeGreaterThan(0);
    expect(screen.queryByText("£3.00")).toBeNull();
  });

  it("keeps a former member out of an `everyone` split", () => {
    mockData([ALICE, BOB, CARA_FORMER]);

    renderReview();

    // An `everyone` split resolves over current members only, so Cara holds no
    // share of this item and gets no column — not a £0.00 one. (A former member
    // who DOES hold a share is a different case: see the next test.)
    expect(screen.getByText("Alice")).toBeDefined();
    expect(screen.getByText("Bob")).toBeDefined();
    expect(screen.queryByText("Cara")).toBeNull();
  });

  it("shows a former member's share when the item was explicitly split with them", () => {
    // An `equal` assignment made before Cara left keeps her `item_assignments`
    // row, so she really does hold £4.50 of this £9 item. Showing only current
    // members would display Alice's £4.50 under a £9.00 total and hide half of a
    // live debt.
    mockData([ALICE, BOB, CARA_FORMER], {
      type: "equal",
      memberIds: [ALICE.id, CARA_FORMER.id],
    });

    renderReview();

    // Cara gets a column, marked as having left.
    expect(screen.getByText("Cara (left)")).toBeDefined();
    // Both halves are on screen, so the columns still account for the total.
    expect(screen.getAllByText("£4.50").length).toBeGreaterThanOrEqual(2);
    // Bob is a current member with no share — still listed, at zero.
    expect(screen.getByText("Bob")).toBeDefined();
  });

  it("still splits over everyone when nobody has left", () => {
    // Same receipt, three current members: £9 / 3 = £3.00. Proves the test above
    // is measuring the active filter and not some unrelated arithmetic.
    mockData([ALICE, BOB, { ...CARA_FORMER, active: true }]);

    renderReview();

    expect(screen.getAllByText("£3.00").length).toBeGreaterThan(0);
    expect(screen.getByText("Cara")).toBeDefined();
  });
});
