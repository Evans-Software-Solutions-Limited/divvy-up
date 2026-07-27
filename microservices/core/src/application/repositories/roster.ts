import { asc, eq } from "drizzle-orm";
import { groupMembers, type Db, type GroupMemberRow } from "@divvy-up/db";
import type { Member } from "../../domain/types";

/** Anything with `.select` — the singleton `Db` and a `Db` transaction both qualify. */
type Executor = Pick<Db, "select">;

/**
 * Row → domain `Member`. Shared so every `Group` payload has one shape, whichever
 * endpoint produced it (the groups endpoints and the invite-accept response
 * hydrate the same thing).
 */
export function toMember(row: GroupMemberRow): Member {
  return {
    id: row.id,
    groupId: row.groupId,
    name: row.name,
    active: row.active,
    colourIndex: row.colourIndex,
  };
}

/**
 * A group's full roster, oldest membership first — **including members who have
 * been removed**, flagged `active: false`.
 *
 * Former members are returned deliberately. A finalized expense pins its
 * participants, so someone removed afterwards keeps owing (or being owed) their
 * frozen share, and a client with no way to resolve their id can only drop the
 * debt from the screen — which is money silently disappearing. Callers that
 * OFFER members as choices (payer pickers, assignment editors, `everyone`
 * splits) must filter on `active` themselves; the write paths reject an
 * inactive member.
 *
 * This does NOT gate access: callers authorise separately via `isActiveMember`.
 * Being in the roster is not being a member of the group.
 */
export async function hydrateRoster(
  executor: Executor,
  groupId: string,
): Promise<Member[]> {
  const rows = await executor
    .select()
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId))
    .orderBy(asc(groupMembers.createdAt));
  return rows.map(toMember);
}
