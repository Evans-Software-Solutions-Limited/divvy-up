import { and, asc, eq, inArray } from "drizzle-orm";
import {
  getDb,
  groupMembers,
  groups,
  type Db,
  type GroupMemberRow,
  type GroupRow,
} from "@divvy-up/db";
import type { Group, Member } from "../../domain/types";
import { DEV_USER_ID, ensureDevUser } from "./devUser";
import { isUuid } from "./isUuid";

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

/** Lowest 0..7 colour slot not already used by the group's active members. */
function nextColourIndex(usedIndexes: number[]): number {
  const used = new Set(usedIndexes);
  for (let i = 0; i < 8; i++) {
    if (!used.has(i)) return i;
  }
  return usedIndexes.length % 8;
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

  // TODO(auth, phase 2): scope to the caller's memberships
  async list(): Promise<Group[]> {
    const groupRows = await this.db
      .select()
      .from(groups)
      .orderBy(asc(groups.createdAt));
    if (groupRows.length === 0) return [];

    const groupIds = groupRows.map((g) => g.id);
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

  async create(name: string): Promise<Group> {
    return this.db.transaction(async (tx) => {
      await ensureDevUser(tx);
      // Do NOT auto-insert a creator member row here — that changes the API
      // response shape; the creator's own membership arrives with auth in Phase 2.
      const [row] = await tx
        .insert(groups)
        .values({ name, createdBy: DEV_USER_ID })
        .returning();
      return toGroup(row, []);
    });
  }

  async findById(id: string): Promise<Group | null> {
    if (!isUuid(id)) return null;

    const [row] = await this.db.select().from(groups).where(eq(groups.id, id));
    if (!row) return null;

    const memberRows = await this.db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, id), eq(groupMembers.active, true)))
      .orderBy(asc(groupMembers.createdAt));

    return toGroup(row, memberRows.map(toMember));
  }

  async addMember(groupId: string, name: string): Promise<Member | null> {
    if (!isUuid(groupId)) return null;

    const [group] = await this.db
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.id, groupId));
    if (!group) return null;

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
