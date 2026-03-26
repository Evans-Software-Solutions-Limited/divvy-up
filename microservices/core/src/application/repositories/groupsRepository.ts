import type { Group } from "../../domain/types";

export class GroupsRepository {
  static readonly key = "GroupsRepository";

  async list(/* future: userId or memberId filter */): Promise<Group[]> {
    // TODO: query Postgres — return stub until DB is wired
    return [];
  }

  async create(name: string): Promise<Group> {
    // TODO: insert into Postgres
    return {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
      members: [],
    };
  }

  async findById(id: string): Promise<Group | null> {
    // TODO: query Postgres
    void id;
    return null;
  }
}
