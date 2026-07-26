// A finalized expense pins its participants, so a member removed afterwards
// keeps owing their frozen share. The group payload therefore carries former
// members flagged `active: false`, and this screen has to name them — before
// that, a debt owed by someone who had left was silently dropped from the list
// and the money simply vanished from the UI.
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { UseQueryResult } from "@tanstack/react-query";
import { Balances } from "../Balances";
import { useGetGroupBalances } from "@/hooks/api/useGetGroupBalances";

vi.mock("@/hooks/api/useGetGroupBalances");
const mockUseGetGroupBalances = vi.mocked(useGetGroupBalances);

const GROUP_ID = "group-1";
const ALICE = {
  id: "m-alice",
  groupId: GROUP_ID,
  name: "Alice",
  active: true,
  colourIndex: 0,
};
const BOB = {
  id: "m-bob",
  groupId: GROUP_ID,
  name: "Bob",
  active: true,
  colourIndex: 1,
};
/** Removed from the group AFTER the expense below was finalized. */
const CARA_FORMER = {
  id: "m-cara",
  groupId: GROUP_ID,
  name: "Cara",
  active: false,
  colourIndex: 2,
};

function mockBalances(
  members: Array<Record<string, unknown>>,
  balances: Array<{ fromMemberId: string; toMemberId: string; amount: number }>,
) {
  mockUseGetGroupBalances.mockReturnValue({
    isLoading: false,
    isError: false,
    data: {
      group: { id: GROUP_ID, name: "Trip", createdAt: "", members },
      balances,
    },
  } as unknown as UseQueryResult<unknown>);
}

function renderBalances() {
  // Rendered through a real route: the page reads `:id` via `useParams` and
  // renders nothing without it.
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[`/groups/${GROUP_ID}/balances`]}>
        <Routes>
          <Route path="/groups/:id/balances" element={<Balances />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Balances — members who have left the group", () => {
  it("names a debtor who has left, and marks them as having left", () => {
    mockBalances(
      [ALICE, BOB, CARA_FORMER],
      [{ fromMemberId: CARA_FORMER.id, toMemberId: ALICE.id, amount: 1000 }],
    );

    renderBalances();

    // The debt is rendered against her real name — not dropped, and not an
    // anonymous placeholder. The amount appears twice (header total + the row),
    // which is itself the proof it survived into the owed total.
    expect(screen.getByText("Cara")).toBeDefined();
    expect(screen.getByText("Left group")).toBeDefined();
    expect(screen.getAllByText("£10.00")).toHaveLength(2);
  });

  it("does not mark current members as having left", () => {
    mockBalances(
      [ALICE, BOB],
      [{ fromMemberId: BOB.id, toMemberId: ALICE.id, amount: 500 }],
    );

    renderBalances();

    expect(screen.getByText("Bob")).toBeDefined();
    expect(screen.queryByText("Left group")).toBeNull();
  });

  it("defaults the 'owed to' perspective to a current member, not a former one", () => {
    // Cara is first in the roster (she joined earliest) but has left. Defaulting
    // to her would render the whole screen from the viewpoint of someone no
    // longer in the group — Alice is owed the money, so she is the payee.
    mockBalances(
      [CARA_FORMER, ALICE, BOB],
      [{ fromMemberId: BOB.id, toMemberId: ALICE.id, amount: 500 }],
    );

    renderBalances();

    // The debt row renders "owes <payee name>", which pins whose perspective it is.
    expect(screen.getByText(`owes ${ALICE.name}`)).toBeDefined();
  });

  it("still labels a balance naming an id outside the roster", () => {
    // Shouldn't happen — a balance always comes from this group's expenses — but
    // the row must never disappear, since it represents real money owed.
    mockBalances(
      [ALICE],
      [{ fromMemberId: "m-unknown", toMemberId: ALICE.id, amount: 250 }],
    );

    renderBalances();

    expect(screen.getByText("Unknown member")).toBeDefined();
    expect(screen.getAllByText("£2.50")).toHaveLength(2);
  });
});
