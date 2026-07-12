// In-memory double for GroupsRepository, used by the handler/service tests via
// the vitest.setup.ts module mock. This is the CURRENT (pre-Postgres) Map-store
// implementation, moved verbatim — those tests seed via non-UUID fixture ids
// ("group-1", "member-1") and can never run against real FK/uuid columns.
// Repository correctness against the real schema is covered separately by the
// PGlite-backed *.pg.test.ts suites.
import type { GroupsRepository } from "../../groupsRepository";
import type { Group, Member } from "../../../../domain/types";

export class InMemoryGroupsRepository {
  static readonly key = "GroupsRepository";

  private readonly store = new Map<string, Group>();

  async list(): Promise<Group[]> {
    return [...this.store.values()];
  }

  async create(name: string): Promise<Group> {
    const group: Group = {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
      members: [],
    };
    this.store.set(group.id, group);
    return group;
  }

  async findById(id: string): Promise<Group | null> {
    return this.store.get(id) ?? null;
  }

  async addMember(groupId: string, name: string): Promise<Member | null> {
    const group = this.store.get(groupId);
    if (!group) return null;
    const member: Member = {
      id: crypto.randomUUID(),
      groupId,
      name,
    };
    group.members.push(member);
    return member;
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
