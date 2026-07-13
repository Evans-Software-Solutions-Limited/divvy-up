import { and, eq } from "drizzle-orm";
import { groupMembers, type Db } from "@divvy-up/db";

/** Anything that exposes `.select` the way `Db` and a `Db` transaction both do. */
type SelectCapable = Pick<Db, "select">;

/**
 * True iff `userId` has an ACTIVE `group_members` row in `groupId`.
 *
 * Shared by GroupsRepository and ExpensesRepository to scope every
 * read/write to the caller's own groups (data-and-persistence Requirement
 * 7). Callers translate `false` into a `null`/`[]` result — this never
 * distinguishes "group doesn't exist" from "caller isn't a member" (Req
 * 7.4), so existence is never leaked.
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
