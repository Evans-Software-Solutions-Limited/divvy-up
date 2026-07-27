// In-memory double for GroupsRepository, used by the handler/service tests via
// the vitest.setup.ts module mock. This is the CURRENT (pre-Postgres) Map-store
// implementation, moved verbatim — those tests seed via non-UUID fixture ids
// ("group-1", "member-1") and can never run against real FK/uuid columns.
// Repository correctness against the real schema is covered separately by the
// PGlite-backed *.pg.test.ts suites.
//
// Ownership scoping (data-and-persistence Requirement 7) is modelled here too:
// each `Member` carries the `userId` of the account it's linked to (undefined
// for a placeholder), and every read/write is scoped to active memberships —
// mirroring the real `GroupsRepository`'s `group_members` join.
import type { GroupsRepository } from "../../groupsRepository";
import type { Group, Member } from "../../../../domain/types";
import { nextColourIndex } from "../../colourIndex";

export class InMemoryGroupsRepository {
  static readonly key = "GroupsRepository";

  private readonly store = new Map<string, Group>();

  private isMember(userId: string, groupId: string): boolean {
    return (
      this.store
        .get(groupId)
        ?.members.some((m) => m.userId === userId && m.active) ?? false
    );
  }

  async list(userId: string): Promise<Group[]> {
    return [...this.store.values()].filter((g) => this.isMember(userId, g.id));
  }

  /** Mirrors the real repo: creating a group also adds the creator as a member. */
  async create(userId: string, name: string): Promise<Group> {
    const groupId = crypto.randomUUID();
    const creator: Member = {
      id: crypto.randomUUID(),
      groupId,
      name: "Creator",
      userId,
      active: true,
      colourIndex: 0,
    };
    const group: Group = {
      id: groupId,
      name,
      createdAt: new Date().toISOString(),
      members: [creator],
    };
    this.store.set(groupId, group);
    return group;
  }

  async findById(userId: string, id: string): Promise<Group | null> {
    if (!this.isMember(userId, id)) return null;
    return this.store.get(id) ?? null;
  }

  async addMember(
    userId: string,
    groupId: string,
    name: string,
  ): Promise<Member | null> {
    if (!this.isMember(userId, groupId)) return null;
    const group = this.store.get(groupId);
    if (!group) return null;
    const member: Member = {
      id: crypto.randomUUID(),
      groupId,
      name,
      active: true,
      // Delegates to the real helper over the full roster, as the real repo does.
      colourIndex: nextColourIndex(group.members.map((m) => m.colourIndex)),
    };
    group.members.push(member);
    return member;
  }

  /**
   * Test-only: soft-delete a member (models removal). The member stays in the
   * group payload flagged `active: false`, as the real repository returns it.
   */
  _deactivateMember(groupId: string, memberId: string): void {
    const member = this.store
      .get(groupId)
      ?.members.find((m) => m.id === memberId);
    if (member) member.active = false;
  }

  _clearStore(): void {
    this.store.clear();
  }
}

// Structural compatibility check — the double must satisfy the real
// repository's public instance surface (constructor differs deliberately:
// the real class takes an optional injected `Db`).
type PublicSurface = Pick<
  GroupsRepository,
  "list" | "create" | "findById" | "addMember" | "_clearStore"
>;
const _typeCheck: PublicSurface = new InMemoryGroupsRepository();
void _typeCheck;
