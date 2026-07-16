import { and, asc, eq, inArray } from "drizzle-orm";
import {
  getDb,
  groupMembers,
  groups,
  users,
  type Db,
  type GroupMemberRow,
  type GroupRow,
} from "@divvy-up/db";
import type { Group, Member } from "../../domain/types";
import { isActiveMember } from "./membership";
import { isUuid } from "./isUuid";
import { nextColourIndex } from "./colourIndex";

function toMember(row: GroupMemberRow): Member {
  return { id: row.id, groupId: row.groupId, name: row.name };
}

function toGroup(row: GroupRow, members: Member[]): Group {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    members,
  };
}

export class GroupsRepository {
  static readonly key = "GroupsRepository";

  private _db?: Db;
  private readonly injectedDb?: Db;

  // Not a parameter-property shorthand: `packages/web` typechecks this file
  // transitively (via its type-only `import { type CoreApi } from
  // "@divvy-up/core"`) under `erasableSyntaxOnly`, which rejects that syntax.
  constructor(injectedDb?: Db) {
    this.injectedDb = injectedDb;
  }

  /** Lazy resolution — `getDb()` must not run at construction time (module import). */
  private get db(): Db {
    if (!this._db) {
      this._db = this.injectedDb ?? getDb();
    }
    return this._db;
  }

  async list(userId: string): Promise<Group[]> {
    const memberships = await this.db
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(
        and(eq(groupMembers.userId, userId), eq(groupMembers.active, true)),
      );
    if (memberships.length === 0) return [];
    const groupIds = memberships.map((m) => m.groupId);

    const groupRows = await this.db
      .select()
      .from(groups)
      .where(inArray(groups.id, groupIds))
      .orderBy(asc(groups.createdAt));
    if (groupRows.length === 0) return [];

    const memberRows = await this.db
      .select()
      .from(groupMembers)
      .where(
        and(
          inArray(groupMembers.groupId, groupIds),
          eq(groupMembers.active, true),
        ),
      )
      .orderBy(asc(groupMembers.createdAt));

    const membersByGroup = new Map<string, Member[]>();
    for (const row of memberRows) {
      const list = membersByGroup.get(row.groupId) ?? [];
      list.push(toMember(row));
      membersByGroup.set(row.groupId, list);
    }

    return groupRows.map((row) =>
      toGroup(row, membersByGroup.get(row.id) ?? []),
    );
  }

  /**
   * Creates the group AND the creator's own `group_members` row in one
   * transaction (Requirement 7.5) — the response now includes the creator as
   * a member, an intended change vs Phase 1 (which left `members: []`).
   */
  async create(userId: string, name: string): Promise<Group> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(groups)
        .values({ name, createdBy: userId })
        .returning();

      const [creator] = await tx
        .select({ displayName: users.displayName, email: users.email })
        .from(users)
        .where(eq(users.id, userId));
      const creatorName =
        creator?.displayName || creator?.email.split("@")[0] || "Member";

      const [memberRow] = await tx
        .insert(groupMembers)
        .values({
          groupId: row.id,
          userId,
          name: creatorName,
          colourIndex: 0,
          placeholder: false,
          active: true,
        })
        .returning();

      return toGroup(row, [toMember(memberRow)]);
    });
  }

  /** Returns null unless `userId` is an active member of the group (Req 7.3/7.4). */
  async findById(userId: string, id: string): Promise<Group | null> {
    if (!isUuid(id)) return null;
    if (!(await isActiveMember(this.db, userId, id))) return null;

    const [row] = await this.db.select().from(groups).where(eq(groups.id, id));
    if (!row) return null;

    const memberRows = await this.db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, id), eq(groupMembers.active, true)))
      .orderBy(asc(groupMembers.createdAt));

    return toGroup(row, memberRows.map(toMember));
  }

  /** Returns null unless `userId` is an active member of `groupId` (Req 7.3/7.4). */
  async addMember(
    userId: string,
    groupId: string,
    name: string,
  ): Promise<Member | null> {
    if (!isUuid(groupId)) return null;
    if (!(await isActiveMember(this.db, userId, groupId))) return null;

    const activeMembers = await this.db
      .select({ colourIndex: groupMembers.colourIndex })
      .from(groupMembers)
      .where(
        and(eq(groupMembers.groupId, groupId), eq(groupMembers.active, true)),
      );

    // Known benign race: this read-then-write isn't serialised, so two
    // concurrent addMember calls on the same group can pick the same free slot
    // and both commit (the schema range-checks colour_index 0..7 but doesn't
    // enforce uniqueness). Effect is cosmetic only — a duplicated palette
    // colour, no integrity loss — and there is no real concurrency in Phase 1
    // (single dev user). A hard fix (advisory lock or a unique constraint that
    // tolerates the >8-member `% 8` wraparound) is deferred to groups-and-members (#5).
    const colourIndex = nextColourIndex(
      activeMembers.map((m) => m.colourIndex),
    );

    const [row] = await this.db
      .insert(groupMembers)
      .values({ groupId, name, colourIndex, placeholder: true })
      .returning();

    return toMember(row);
  }

  _clearStore(): void {
    throw new Error(
      "_clearStore is test-only; the vitest setup swaps in the in-memory double",
    );
  }
}

export const groupsRepo = new GroupsRepository();
