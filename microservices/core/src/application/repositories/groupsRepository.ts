import type { Group, Member } from "../../domain/types";

export class GroupsRepository {
  static readonly key = "GroupsRepository";

  private readonly store = new Map<string, Group>();

  async list(): Promise<Group[]> {
    // TODO: query Postgres
    return [...this.store.values()];
  }

  async create(name: string): Promise<Group> {
    // TODO: insert into Postgres
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
    // TODO: query Postgres
    return this.store.get(id) ?? null;
  }

  async addMember(groupId: string, name: string): Promise<Member | null> {
    // TODO: insert into Postgres
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

export const groupsRepo = new GroupsRepository();
