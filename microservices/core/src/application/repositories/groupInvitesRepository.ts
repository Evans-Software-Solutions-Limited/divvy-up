import { and, asc, eq, isNull } from "drizzle-orm";
import {
  getDb,
  groupInvites,
  groupMembers,
  groups,
  users,
  type Db,
  type GroupInviteRow,
  type GroupMemberRow,
  type GroupRow,
} from "@divvy-up/db";
import type {
  Group,
  GroupInvite,
  InvitePreview,
  Member,
} from "../../domain/types";
import { isActiveMember } from "./membership";
import { isUuid } from "./isUuid";
import { nextColourIndex } from "./colourIndex";
import { generateInviteToken, hashInviteToken } from "./inviteToken";

// ─── Invite policy (decided for this slice; see brief §4) ──────────────────────
//
// Two invite shapes, distinguished by `memberId`:
//
//   • OPEN invite (memberId = null): accepting creates a NEW member for the
//     caller. This is the reusable "group link" — one link onboards many people,
//     good until it expires. `usedAt` is intentionally NEVER set for open
//     invites (setting it would break reusability).
//
//   • SEAT invite (memberId set): accepting CLAIMS one specific placeholder seat
//     (links the caller's account to it). A seat can only be claimed once, so
//     this invite is inherently SINGLE-USE — `usedAt` is stamped when the seat
//     is claimed and a used seat invite can never be redeemed again.
//
// So "used" tracks exactly one thing: consumption of the one-shot resource (the
// seat). Expiry (`expiresAt`) applies to both shapes.
//
// Accepting REQUIRES an authenticated caller (V1) — `coreAuth` already
// guarantees it. Placeholder members + invite links approximate Tricount's
// account-free join (someone is a named seat immediately, then links their
// account via the link); true anonymous join is deliberately out of scope.
const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export type CreateInviteInput = {
  groupId: string;
  /** Optional placeholder seat to attach (open invite when omitted/null). */
  memberId?: string | null;
};

export type CreateInviteResult =
  | { ok: true; token: string; invite: GroupInvite }
  // caller isn't a member, or the group id is garbage — 404, existence not leaked
  | { ok: false; reason: "not_member" }
  // memberId isn't a member of this group (or was deleted) — 404, existence not leaked
  | { ok: false; reason: "member_not_found" }
  // memberId is a real seat but not an unclaimed placeholder — 409
  | { ok: false; reason: "seat_unavailable" };

export type AcceptInviteResult =
  | { ok: true; group: Group; member: Member; alreadyMember: boolean }
  // token not found / group gone — 404, existence not leaked
  | { ok: false; reason: "invalid" }
  // valid token, past expiry — 410
  | { ok: false; reason: "expired" }
  // single-use (seat) invite already redeemed — 410
  | { ok: false; reason: "used" }
  // the seat was already claimed by someone else — 409
  | { ok: false; reason: "seat_unavailable" };

function toInvite(row: GroupInviteRow): GroupInvite {
  return {
    id: row.id,
    groupId: row.groupId,
    memberId: row.memberId,
    expiresAt: row.expiresAt.toISOString(),
    usedAt: row.usedAt ? row.usedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toMember(row: GroupMemberRow): Member {
  return { id: row.id, groupId: row.groupId, name: row.name };
}

/** Anything with `.select` — the singleton `Db` and a `Db` transaction both qualify. */
type Executor = Pick<Db, "select">;

/** Loads a group with its active members (newest-membership-last), for a success payload. */
async function buildGroup(
  executor: Executor,
  groupRow: GroupRow,
): Promise<Group> {
  const memberRows = await executor
    .select()
    .from(groupMembers)
    .where(
      and(eq(groupMembers.groupId, groupRow.id), eq(groupMembers.active, true)),
    )
    .orderBy(asc(groupMembers.createdAt));
  return {
    id: groupRow.id,
    name: groupRow.name,
    createdAt: groupRow.createdAt.toISOString(),
    members: memberRows.map(toMember),
  };
}

export class GroupInvitesRepository {
  static readonly key = "GroupInvitesRepository";

  private _db?: Db;
  private readonly injectedDb?: Db;

  // Not a parameter-property shorthand — see GroupsRepository for why
  // (`packages/web` typechecks this transitively under `erasableSyntaxOnly`).
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

  /**
   * Creates an invite for `groupId`. Caller must be an active member. The raw
   * token is returned EXACTLY ONCE here and never persisted or logged; only its
   * hash is stored. Pass `memberId` to bind a specific placeholder seat.
   */
  async create(
    userId: string,
    input: CreateInviteInput,
  ): Promise<CreateInviteResult> {
    const { groupId } = input;
    const memberId = input.memberId ?? null;

    if (!isUuid(groupId)) return { ok: false, reason: "not_member" };
    if (memberId !== null && !isUuid(memberId)) {
      return { ok: false, reason: "member_not_found" };
    }
    if (!(await isActiveMember(this.db, userId, groupId))) {
      return { ok: false, reason: "not_member" };
    }

    if (memberId !== null) {
      const [seat] = await this.db
        .select()
        .from(groupMembers)
        .where(eq(groupMembers.id, memberId));
      // Not in this group (or deleted) → 404, don't leak which case it is.
      if (!seat || seat.groupId !== groupId || !seat.active) {
        return { ok: false, reason: "member_not_found" };
      }
      // A real seat, but already linked to an account or not a placeholder → 409.
      if (seat.userId !== null || !seat.placeholder) {
        return { ok: false, reason: "seat_unavailable" };
      }
      // Benign race: the seat could be claimed between this check and redemption.
      // Not guarded here because `accept` re-validates the seat inside its
      // transaction — this check is only to fail fast on an obviously bad request.
    }

    const rawToken = generateInviteToken();
    const [row] = await this.db
      .insert(groupInvites)
      .values({
        groupId,
        memberId,
        tokenHash: hashInviteToken(rawToken),
        createdBy: userId,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      })
      .returning();

    return { ok: true, token: rawToken, invite: toInvite(row) };
  }

  /**
   * Redeems `rawToken` for `userId`. Atomic: the whole validate → claim-or-create
   * → mark-used sequence runs in one transaction so a token can never leave the
   * group in a half-updated state.
   *
   * Idempotent by design: a caller who already has a membership (active or
   * soft-deleted) is returned/reactivated rather than duplicated — the partial
   * unique index `group_members_group_user_uniq` makes a second real membership
   * impossible, and `onConflictDoNothing` turns the concurrent-double-accept
   * race into a re-read instead of a 500.
   */
  async accept(userId: string, rawToken: string): Promise<AcceptInviteResult> {
    const tokenHash = hashInviteToken(rawToken);
    const now = new Date();

    return this.db.transaction(async (tx) => {
      const [invite] = await tx
        .select()
        .from(groupInvites)
        .where(eq(groupInvites.tokenHash, tokenHash));
      if (!invite) return { ok: false, reason: "invalid" };
      if (invite.expiresAt <= now) return { ok: false, reason: "expired" };

      const isSeatInvite = invite.memberId !== null;
      if (isSeatInvite && invite.usedAt !== null) {
        return { ok: false, reason: "used" };
      }

      const [groupRow] = await tx
        .select()
        .from(groups)
        .where(eq(groups.id, invite.groupId));
      // Group deleted since the invite was created — treat as an invalid token
      // rather than 500. (FK is ON DELETE CASCADE, so this is defensive.)
      if (!groupRow) return { ok: false, reason: "invalid" };

      // Already linked to this group (active OR soft-deleted)? Never create a
      // second row — the unique index would reject it anyway. Reactivate a
      // removed member; return an active one unchanged. A seat invite is left
      // unconsumed so its intended recipient can still claim it.
      const [existing] = await tx
        .select()
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, invite.groupId),
            eq(groupMembers.userId, userId),
          ),
        );
      if (existing) {
        if (!existing.active) {
          const [reactivated] = await tx
            .update(groupMembers)
            .set({ active: true })
            .where(eq(groupMembers.id, existing.id))
            .returning();
          return {
            ok: true,
            group: await buildGroup(tx, groupRow),
            member: toMember(reactivated),
            alreadyMember: false,
          };
        }
        return {
          ok: true,
          group: await buildGroup(tx, groupRow),
          member: toMember(existing),
          alreadyMember: true,
        };
      }

      if (isSeatInvite) {
        const [seat] = await tx
          .select()
          .from(groupMembers)
          .where(eq(groupMembers.id, invite.memberId as string));
        if (!seat || seat.groupId !== invite.groupId || !seat.active) {
          return { ok: false, reason: "invalid" };
        }
        if (seat.userId !== null || !seat.placeholder) {
          return { ok: false, reason: "seat_unavailable" };
        }
        // Claim the seat, guarding on BOTH "still an unclaimed placeholder"
        // conditions so a concurrent claim updates zero rows here (→
        // seat_unavailable) instead of both winning. Guarding on both columns
        // (not just one) keeps the invariant intact even if a future flow ever
        // decouples `placeholder` from `user_id`.
        const [claimed] = await tx
          .update(groupMembers)
          .set({ userId, placeholder: false })
          .where(
            and(
              eq(groupMembers.id, seat.id),
              eq(groupMembers.placeholder, true),
              isNull(groupMembers.userId),
            ),
          )
          .returning();
        if (!claimed) return { ok: false, reason: "seat_unavailable" };

        await tx
          .update(groupInvites)
          .set({ usedAt: now })
          .where(eq(groupInvites.id, invite.id));

        return {
          ok: true,
          group: await buildGroup(tx, groupRow),
          member: toMember(claimed),
          alreadyMember: false,
        };
      }

      // Open invite → create a new member for the caller. Name derived the same
      // way as GroupsRepository.create (displayName → email local-part → fallback).
      const [user] = await tx
        .select({ displayName: users.displayName, email: users.email })
        .from(users)
        .where(eq(users.id, userId));
      const name = user?.displayName || user?.email.split("@")[0] || "Member";

      const activeMembers = await tx
        .select({ colourIndex: groupMembers.colourIndex })
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, invite.groupId),
            eq(groupMembers.active, true),
          ),
        );
      const colourIndex = nextColourIndex(
        activeMembers.map((m) => m.colourIndex),
      );

      const inserted = await tx
        .insert(groupMembers)
        .values({
          groupId: invite.groupId,
          userId,
          name,
          colourIndex,
          placeholder: false,
          active: true,
        })
        .onConflictDoNothing()
        .returning();

      if (inserted.length === 0) {
        // A concurrent accept won the (group, user) slot — return that row.
        const [row] = await tx
          .select()
          .from(groupMembers)
          .where(
            and(
              eq(groupMembers.groupId, invite.groupId),
              eq(groupMembers.userId, userId),
            ),
          );
        return {
          ok: true,
          group: await buildGroup(tx, groupRow),
          member: toMember(row),
          alreadyMember: true,
        };
      }

      // Open invite: intentionally NOT marked used — it stays reusable.
      return {
        ok: true,
        group: await buildGroup(tx, groupRow),
        member: toMember(inserted[0]),
        alreadyMember: false,
      };
    });
  }

  /**
   * Pre-join preview, gated only by holding a valid token (the capability). No
   * membership required — the whole point is to preview before joining. Returns
   * null (→ 404) for an unknown, expired, or spent-seat token, leaking nothing.
   */
  async lookup(rawToken: string): Promise<InvitePreview | null> {
    const [invite] = await this.db
      .select()
      .from(groupInvites)
      .where(eq(groupInvites.tokenHash, hashInviteToken(rawToken)));
    if (!invite) return null;
    if (invite.expiresAt <= new Date()) return null;
    if (invite.memberId !== null && invite.usedAt !== null) return null;

    const [groupRow] = await this.db
      .select()
      .from(groups)
      .where(eq(groups.id, invite.groupId));
    if (!groupRow) return null;

    const memberRows = await this.db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, invite.groupId),
          eq(groupMembers.active, true),
        ),
      );

    return {
      groupId: groupRow.id,
      groupName: groupRow.name,
      memberCount: memberRows.length,
    };
  }

  _clearStore(): void {
    throw new Error(
      "_clearStore is test-only; the vitest setup swaps in the in-memory double",
    );
  }
}

export const groupInvitesRepo = new GroupInvitesRepository();
