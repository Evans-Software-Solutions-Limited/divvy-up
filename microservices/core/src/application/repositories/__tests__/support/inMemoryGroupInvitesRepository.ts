// In-memory double for GroupInvitesRepository, used by the handler/service tests
// via the vitest.setup.ts module mock. Handler tests seed via non-UUID fixture
// ids ("group-1") and drive status-code mapping; they can never run against
// real FK/uuid columns. Repository correctness against the real schema is
// covered separately by the PGlite-backed groupInvitesRepository.pg.test.ts.
//
// It models the same authorization/policy the real repo enforces: caller must
// be an active member to create; open invites are reusable, seat invites are
// single-use; membership is idempotent (existing member returned, soft-deleted
// member reactivated) — mirroring the real transaction without a live DB.
import type {
  AcceptInviteResult,
  CreateInviteInput,
  CreateInviteResult,
  GroupInvitesRepository,
} from "../../groupInvitesRepository";
import type { Group, InvitePreview, Member } from "../../../../domain/types";

type MemberRec = {
  id: string;
  groupId: string;
  name: string;
  userId: string | null;
  placeholder: boolean;
  active: boolean;
};

type InviteRec = {
  id: string;
  groupId: string;
  memberId: string | null;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export class InMemoryGroupInvitesRepository {
  static readonly key = "GroupInvitesRepository";

  private readonly groups = new Map<string, { id: string; name: string }>();
  private readonly members = new Map<string, MemberRec>();
  /** keyed by RAW token — the double doesn't hash (the real repo does). */
  private readonly invites = new Map<string, InviteRec>();
  /** userId → display name used when an open invite mints a new member. */
  private readonly userNames = new Map<string, string>();

  // ── test-only seed helpers ──────────────────────────────────────────────────

  _addGroup(groupId: string, name = "Test Group"): void {
    this.groups.set(groupId, { id: groupId, name });
  }

  /** Register `userId` as an active, linked member of `groupId`. */
  _addMember(groupId: string, userId: string, name = "Member"): string {
    if (!this.groups.has(groupId)) this._addGroup(groupId);
    const id = crypto.randomUUID();
    this.members.set(id, {
      id,
      groupId,
      name,
      userId,
      placeholder: false,
      active: true,
    });
    return id;
  }

  /** Register an unclaimed placeholder seat; returns its member id. */
  _addPlaceholderSeat(groupId: string, name = "Seat"): string {
    if (!this.groups.has(groupId)) this._addGroup(groupId);
    const id = crypto.randomUUID();
    this.members.set(id, {
      id,
      groupId,
      name,
      userId: null,
      placeholder: true,
      active: true,
    });
    return id;
  }

  /** Soft-delete an existing member row (models a removed member). */
  _deactivateMember(memberId: string): void {
    const m = this.members.get(memberId);
    if (m) m.active = false;
  }

  _setUserName(userId: string, name: string): void {
    this.userNames.set(userId, name);
  }

  /** Directly seed an invite (for expired/used edge cases the flow can't produce). */
  _seedInvite(
    token: string,
    invite: {
      groupId: string;
      memberId?: string | null;
      expiresAt?: Date;
      usedAt?: Date | null;
    },
  ): void {
    this.invites.set(token, {
      id: crypto.randomUUID(),
      groupId: invite.groupId,
      memberId: invite.memberId ?? null,
      expiresAt: invite.expiresAt ?? new Date(Date.now() + YEAR_MS),
      usedAt: invite.usedAt ?? null,
      createdAt: new Date(),
    });
  }

  // ── internal helpers ────────────────────────────────────────────────────────

  private membersOf(groupId: string): MemberRec[] {
    return [...this.members.values()].filter((m) => m.groupId === groupId);
  }

  private isMember(userId: string, groupId: string): boolean {
    return this.membersOf(groupId).some((m) => m.userId === userId && m.active);
  }

  private buildGroup(groupId: string): Group {
    const g = this.groups.get(groupId);
    return {
      id: groupId,
      name: g?.name ?? "Test Group",
      createdAt: new Date(0).toISOString(),
      members: this.membersOf(groupId)
        .filter((m) => m.active)
        .map((m) => this.toMember(m)),
    };
  }

  private toMember(m: MemberRec): Member {
    return { id: m.id, groupId: m.groupId, name: m.name };
  }

  // ── public surface (mirrors the real repository) ────────────────────────────

  async create(
    userId: string,
    input: CreateInviteInput,
  ): Promise<CreateInviteResult> {
    const { groupId } = input;
    const memberId = input.memberId ?? null;

    if (!this.isMember(userId, groupId))
      return { ok: false, reason: "not_member" };

    if (memberId !== null) {
      const seat = this.members.get(memberId);
      if (!seat || seat.groupId !== groupId || !seat.active) {
        return { ok: false, reason: "member_not_found" };
      }
      if (seat.userId !== null || !seat.placeholder) {
        return { ok: false, reason: "seat_unavailable" };
      }
    }

    const token = crypto.randomUUID();
    const rec: InviteRec = {
      id: crypto.randomUUID(),
      groupId,
      memberId,
      expiresAt: new Date(Date.now() + YEAR_MS),
      usedAt: null,
      createdAt: new Date(),
    };
    this.invites.set(token, rec);

    return {
      ok: true,
      token,
      invite: {
        id: rec.id,
        groupId: rec.groupId,
        memberId: rec.memberId,
        expiresAt: rec.expiresAt.toISOString(),
        usedAt: null,
        createdAt: rec.createdAt.toISOString(),
      },
    };
  }

  async accept(userId: string, token: string): Promise<AcceptInviteResult> {
    const now = new Date();
    const invite = this.invites.get(token);
    if (!invite) return { ok: false, reason: "invalid" };
    if (invite.expiresAt <= now) return { ok: false, reason: "expired" };

    const isSeatInvite = invite.memberId !== null;
    if (isSeatInvite && invite.usedAt !== null) {
      return { ok: false, reason: "used" };
    }
    if (!this.groups.has(invite.groupId))
      return { ok: false, reason: "invalid" };

    const existing = this.membersOf(invite.groupId).find(
      (m) => m.userId === userId,
    );
    if (existing) {
      if (!existing.active) {
        existing.active = true;
        return {
          ok: true,
          group: this.buildGroup(invite.groupId),
          member: this.toMember(existing),
          alreadyMember: false,
        };
      }
      return {
        ok: true,
        group: this.buildGroup(invite.groupId),
        member: this.toMember(existing),
        alreadyMember: true,
      };
    }

    if (isSeatInvite) {
      const seat = this.members.get(invite.memberId as string);
      if (!seat || seat.groupId !== invite.groupId || !seat.active) {
        return { ok: false, reason: "invalid" };
      }
      if (seat.userId !== null || !seat.placeholder) {
        return { ok: false, reason: "seat_unavailable" };
      }
      seat.userId = userId;
      seat.placeholder = false;
      invite.usedAt = now;
      return {
        ok: true,
        group: this.buildGroup(invite.groupId),
        member: this.toMember(seat),
        alreadyMember: false,
      };
    }

    const id = crypto.randomUUID();
    const member: MemberRec = {
      id,
      groupId: invite.groupId,
      name: this.userNames.get(userId) ?? "Member",
      userId,
      placeholder: false,
      active: true,
    };
    this.members.set(id, member);
    // Open invite: intentionally NOT marked used — stays reusable.
    return {
      ok: true,
      group: this.buildGroup(invite.groupId),
      member: this.toMember(member),
      alreadyMember: false,
    };
  }

  async lookup(token: string): Promise<InvitePreview | null> {
    const invite = this.invites.get(token);
    if (!invite) return null;
    if (invite.expiresAt <= new Date()) return null;
    if (invite.memberId !== null && invite.usedAt !== null) return null;
    const g = this.groups.get(invite.groupId);
    if (!g) return null;
    return {
      groupId: g.id,
      groupName: g.name,
      memberCount: this.membersOf(invite.groupId).filter((m) => m.active)
        .length,
    };
  }

  _clearStore(): void {
    this.groups.clear();
    this.members.clear();
    this.invites.clear();
    this.userNames.clear();
  }
}

// Structural compatibility check — the double must satisfy the real
// repository's public instance surface (constructor differs deliberately:
// the real class takes an optional injected `Db`).
type PublicSurface = Pick<
  GroupInvitesRepository,
  "create" | "accept" | "lookup" | "_clearStore"
>;
const _typeCheck: PublicSurface = new InMemoryGroupInvitesRepository();
void _typeCheck;
