import { and, eq } from "drizzle-orm";
import { groupMembers, type Db } from "@divvy-up/db";

/** Anything exposing `.select` the way a `Db` and a `Db` transaction both do. */
type SelectCapable = Pick<Db, "select">;

export type ResolvedMember = { id: string; name: string };

/**
 * Resolves an authenticated `userId` to their ACTIVE member row in `groupId`.
 *
 * Auth gives us a user id, but activity rows reference a `group_members` id
 * (`actorMemberId`). This is the bridge. Callers already inside a transaction
 * pass their `tx` handle so the lookup joins the same snapshot as the mutation
 * it's attributing.
 *
 * Returns `null` when the user has no active member row in the group — the
 * caller decides what that means (in practice the surrounding write is already
 * membership-gated, so a null here is a "should not happen" and the caller
 * skips emitting rather than inventing an actor).
 */
export async function resolveActorMember(
  executor: SelectCapable,
  userId: string,
  groupId: string,
): Promise<ResolvedMember | null> {
  const [row] = await executor
    .select({ id: groupMembers.id, name: groupMembers.name })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, userId),
        eq(groupMembers.active, true),
      ),
    );
  return row ?? null;
}
