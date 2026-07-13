import { and, eq } from "drizzle-orm";
import { getDb, groupMembers, type Db } from "@divvy-up/db";

/** Anything that exposes `.select` the way `Db` and a `Db` transaction both do. */
type SelectCapable = Pick<Db, "select">;

/**
 * True iff `userId` has an ACTIVE `group_members` row in `groupId`.
 *
 * The canonical membership predicate shared across services: it scopes
 * user-facing reads/writes to the caller's own groups (data-and-persistence
 * Requirement 7). Callers translate `false` into a `null`/`[]`/`404` result —
 * this never distinguishes "group doesn't exist" from "caller isn't a member",
 * so existence is never leaked (Req 7.4).
 *
 * The `executor` form is for callers that already hold a `Db` or a transaction
 * (e.g. inside `microservices/core`'s repositories); `isGroupMember` below is
 * the standalone convenience for a one-off check.
 */
export async function isActiveMember(
  executor: SelectCapable,
  userId: string,
  groupId: string,
): Promise<boolean> {
  const [row] = await executor
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, userId),
        eq(groupMembers.active, true),
      ),
    );
  return !!row;
}

/**
 * Standalone membership check for callers that don't already hold a `Db`
 * (e.g. `microservices/other-service`'s receipt handler). Resolves the
 * singleton client by default so the caller needs no direct `@divvy-up/db`
 * dependency; pass an explicit `db` in tests.
 */
export function isGroupMember(
  userId: string,
  groupId: string,
  db: Db = getDb(),
): Promise<boolean> {
  return isActiveMember(db, userId, groupId);
}
