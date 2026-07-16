import { describe, expect, it } from "vitest";
import { simplifyDebts } from "../simplifyDebts";
import type { MemberId } from "../../../../domain/types";

const GROUP = "group-1";

function net(entries: Record<MemberId, number>): Map<MemberId, number> {
  return new Map(Object.entries(entries));
}

/** Every returned transfer's net effect, folded back into a position map. */
function applyTransfers(
  transfers: ReturnType<typeof simplifyDebts>,
): Map<MemberId, number> {
  const result = new Map<MemberId, number>();
  for (const t of transfers) {
    result.set(t.fromMemberId, (result.get(t.fromMemberId) ?? 0) + t.amount);
    result.set(t.toMemberId, (result.get(t.toMemberId) ?? 0) - t.amount);
  }
  return result;
}

describe("simplifyDebts", () => {
  it("returns no transfers when everyone is square", () => {
    expect(simplifyDebts(GROUP, net({ a: 0, b: 0 }))).toEqual([]);
    expect(simplifyDebts(GROUP, new Map())).toEqual([]);
  });

  it("emits a single transfer for one debtor and one creditor", () => {
    // b owes 1000, a is owed 1000
    const result = simplifyDebts(GROUP, net({ a: 1000, b: -1000 }));
    expect(result).toEqual([
      { groupId: GROUP, fromMemberId: "b", toMemberId: "a", amount: 1000 },
    ]);
  });

  it("collapses a chain (a owes b, b owes c) to a direct a→c transfer", () => {
    // Net positions after a→b £10 and b→c £10: a=-10, b=0, c=+10.
    // Minimal settlement is a single a→c transfer — b drops out entirely.
    const result = simplifyDebts(GROUP, net({ a: -1000, b: 0, c: 1000 }));
    expect(result).toEqual([
      { groupId: GROUP, fromMemberId: "a", toMemberId: "c", amount: 1000 },
    ]);
  });

  it("splits one debtor across multiple creditors (fewest transfers)", () => {
    // d owes 3000 total; a owed 2000, b owed 1000.
    const result = simplifyDebts(GROUP, net({ d: -3000, a: 2000, b: 1000 }));
    expect(result).toHaveLength(2);
    // Largest creditor first (deterministic ordering).
    expect(result[0]).toEqual({
      groupId: GROUP,
      fromMemberId: "d",
      toMemberId: "a",
      amount: 2000,
    });
    expect(result[1]).toEqual({
      groupId: GROUP,
      fromMemberId: "d",
      toMemberId: "b",
      amount: 1000,
    });
  });

  it("conserves value — folded transfers reproduce the input positions", () => {
    const positions = net({ a: -1500, b: -500, c: 800, d: 1200 });
    const transfers = simplifyDebts(GROUP, positions);
    const applied = applyTransfers(transfers);
    for (const [id, amount] of positions) {
      // applyTransfers records debtors positive; positions record debtors
      // negative — so applied[id] should equal -position[id].
      expect(applied.get(id) ?? 0).toBe(-amount);
    }
  });

  it("is deterministic regardless of input insertion order", () => {
    const a = simplifyDebts(GROUP, net({ a: 2000, b: 1000, c: -3000 }));
    const b = simplifyDebts(GROUP, net({ c: -3000, b: 1000, a: 2000 }));
    expect(a).toEqual(b);
  });
});
