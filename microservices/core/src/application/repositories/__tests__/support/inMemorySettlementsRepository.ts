// In-memory double for SettlementsRepository, used by the handler/service tests
// via the vitest.setup.ts module mock. Those tests seed via non-UUID fixture
// ids ("group-1", "member-1") and can never run against real FK/uuid columns.
// Repository correctness against the real schema is covered separately by the
// PGlite-backed settlementsRepository.pg.test.ts suite.
//
// Ownership scoping (data-and-persistence Requirement 7) is modelled here: the
// double tracks which users are members of a group (`_addMember`) and which
// member ids belong to a group (`_addGroupMemberId`), mirroring the real repo's
// caller-membership and both-parties-in-group checks without a live DB.
import type {
  RecordSettlementInput,
  SettlementsRepository,
} from "../../settlementsRepository";
import type { Settlement } from "../../../../domain/types";

export class InMemorySettlementsRepository {
  static readonly key = "SettlementsRepository";

  private readonly store = new Map<string, Settlement>();
  /** groupId → set of userIds who are active members (caller-scope check). */
  private readonly membersByGroup = new Map<string, Set<string>>();
  /** groupId → set of memberIds that belong to the group (party check). */
  private readonly memberIdsByGroup = new Map<string, Set<string>>();

  /** Test-only: register `userId` as an active member of `groupId`. */
  _addMember(groupId: string, userId: string): void {
    const set = this.membersByGroup.get(groupId) ?? new Set<string>();
    set.add(userId);
    this.membersByGroup.set(groupId, set);
  }

  /** Test-only: register `memberId` as a member row of `groupId`. */
  _addGroupMemberId(groupId: string, memberId: string): void {
    const set = this.memberIdsByGroup.get(groupId) ?? new Set<string>();
    set.add(memberId);
    this.memberIdsByGroup.set(groupId, set);
  }

  private isMember(userId: string, groupId: string): boolean {
    return this.membersByGroup.get(groupId)?.has(userId) ?? false;
  }

  async record(
    userId: string,
    input: RecordSettlementInput,
  ): Promise<Settlement | null> {
    const { groupId, fromMemberId, toMemberId, amount } = input;
    if (!this.isMember(userId, groupId)) return null;
    const ids = this.memberIdsByGroup.get(groupId);
    if (!ids?.has(fromMemberId) || !ids?.has(toMemberId)) return null;

    const id = crypto.randomUUID();
    const settlement: Settlement = {
      id,
      groupId,
      fromMemberId,
      toMemberId,
      amount,
      recordedBy: userId,
      createdAt: new Date().toISOString(),
    };
    this.store.set(id, settlement);
    return settlement;
  }

  async listByGroup(userId: string, groupId: string): Promise<Settlement[]> {
    if (!this.isMember(userId, groupId)) return [];
    return [...this.store.values()].filter((s) => s.groupId === groupId);
  }

  _clearStore(): void {
    this.store.clear();
    this.membersByGroup.clear();
    this.memberIdsByGroup.clear();
  }
}

// Structural compatibility check — the double must satisfy the real
// repository's public instance surface (constructor differs deliberately:
// the real class takes an optional injected `Db`).
type PublicSurface = Pick<
  SettlementsRepository,
  "record" | "listByGroup" | "_clearStore"
>;
const _typeCheck: PublicSurface = new InMemorySettlementsRepository();
void _typeCheck;
