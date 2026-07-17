// In-memory double for ActivityRepository, used by the handler/service tests via
// the vitest.setup.ts module mock. Those tests seed via non-UUID fixture ids
// ("group-1", "member-1") and can never run against real FK/uuid columns.
// Repository correctness against the real schema — and the atomic emit on
// finalize/settle/member-add — is covered separately by the PGlite-backed
// activityRepository.pg.test.ts suite.
//
// Only the READ path (listByGroup) is modelled here — the write path
// (`recordActivity`) is a free function that participates in the caller's
// transaction and is never invoked through this double. Member scoping mirrors
// the real repo: the double tracks which users are members of a group.
import type { ActivityRepository } from "../../activityRepository";
import type { Activity } from "../../../../domain/types";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export class InMemoryActivityRepository {
  static readonly key = "ActivityRepository";

  private readonly store: Activity[] = [];
  /** groupId → set of userIds who are active members (caller-scope check). */
  private readonly membersByGroup = new Map<string, Set<string>>();

  /** Test-only: register `userId` as an active member of `groupId`. */
  _addMember(groupId: string, userId: string): void {
    const set = this.membersByGroup.get(groupId) ?? new Set<string>();
    set.add(userId);
    this.membersByGroup.set(groupId, set);
  }

  /** Test-only: seed a feed row (insertion order = chronological). */
  _add(activity: Activity): void {
    this.store.push(activity);
  }

  private isMember(userId: string, groupId: string): boolean {
    return this.membersByGroup.get(groupId)?.has(userId) ?? false;
  }

  async listByGroup(
    userId: string,
    groupId: string,
    limit: number = DEFAULT_LIMIT,
  ): Promise<Activity[]> {
    if (!this.isMember(userId, groupId)) return [];
    const capped = Math.min(
      Math.max(Math.trunc(limit) || DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    return (
      this.store
        .filter((a) => a.groupId === groupId)
        // newest first; id desc as the deterministic tie-break, mirroring the real repo.
        .slice()
        .sort((a, b) =>
          b.createdAt !== a.createdAt
            ? b.createdAt.localeCompare(a.createdAt)
            : b.id.localeCompare(a.id),
        )
        .slice(0, capped)
    );
  }

  _clearStore(): void {
    this.store.length = 0;
    this.membersByGroup.clear();
  }
}

// Structural compatibility check — the double must satisfy the real repository's
// public read surface (constructor differs deliberately: the real class takes an
// optional injected `Db`).
type PublicSurface = Pick<ActivityRepository, "listByGroup" | "_clearStore">;
const _typeCheck: PublicSurface = new InMemoryActivityRepository();
void _typeCheck;
