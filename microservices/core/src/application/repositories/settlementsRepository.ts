import { desc, eq } from "drizzle-orm";
import {
  getDb,
  groupMembers,
  settlements as settlementsTable,
  type Db,
  type SettlementRow,
} from "@divvy-up/db";
import type { Settlement } from "../../domain/types";
import { isActiveMember } from "./membership";
import { isUuid } from "./isUuid";
import { activityText, recordActivity } from "./activityRepository";
import { resolveActorMember } from "./resolveMember";

export type RecordSettlementInput = {
  groupId: string;
  fromMemberId: string;
  toMemberId: string;
  /** Positive integer pence. */
  amount: number;
};

function toSettlement(row: SettlementRow): Settlement {
  return {
    id: row.id,
    groupId: row.groupId,
    fromMemberId: row.fromMemberId,
    toMemberId: row.toMemberId,
    amount: row.amount,
    recordedBy: row.recordedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export class SettlementsRepository {
  static readonly key = "SettlementsRepository";

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
   * Records a mark-as-paid. Returns null (→ 404, existence not leaked) unless
   * the caller is an active member of the group AND both parties belong to that
   * same group (active or soft-deleted — see the inline note below on why the
   * parties aren't required to be active). Amount/self-pay validation is
   * enforced upstream by the handler schema and the DB's `settlements_not_self`
   * check.
   */
  async record(
    userId: string,
    input: RecordSettlementInput,
  ): Promise<Settlement | null> {
    const { groupId, fromMemberId, toMemberId, amount } = input;
    if (!isUuid(groupId) || !isUuid(fromMemberId) || !isUuid(toMemberId)) {
      return null;
    }

    // One transaction: membership/party validation, the settlement insert, and
    // the atomic activity emit share a snapshot, so a committed settlement always
    // has its feed row and a rolled-back one leaves none.
    return this.db.transaction(async (tx) => {
      if (!(await isActiveMember(tx, userId, groupId))) return null;

      // Both parties must belong to THIS group — prevents recording a payment
      // against a member id from another group (the FK alone wouldn't catch a
      // valid id belonging to a different group). Deliberately NOT filtered on
      // `active`: `computeBalances` derives debts from expense payer/assignment
      // ids regardless of active status, so a debt owed to (or by) a
      // soft-deleted member must still be settleable — otherwise removing a
      // member would strand their outstanding balance forever. Names are pulled
      // here too so the feed text can be snapshotted without a second round-trip.
      const memberRows = await tx
        .select({ id: groupMembers.id, name: groupMembers.name })
        .from(groupMembers)
        .where(eq(groupMembers.groupId, groupId));
      const nameById = new Map(memberRows.map((m) => [m.id, m.name]));
      if (!nameById.has(fromMemberId) || !nameById.has(toMemberId)) {
        return null;
      }

      const [row] = await tx
        .insert(settlementsTable)
        .values({
          groupId,
          fromMemberId,
          toMemberId,
          amount,
          recordedBy: userId,
        })
        .returning();

      // Actor is the recording user's member row; the text names the payer→payee
      // pair (snapshotted). A missing actor (should not happen — gated above)
      // skips the feed row rather than failing the settlement.
      const actor = await resolveActorMember(tx, userId, groupId);
      if (actor) {
        await recordActivity(tx, {
          groupId,
          actorMemberId: actor.id,
          kind: "settled_up",
          text: activityText.settledUp(
            nameById.get(fromMemberId) as string,
            nameById.get(toMemberId) as string,
            amount,
          ),
          amount,
          settlementId: row.id,
        });
      }

      return toSettlement(row);
    });
  }

  /** Recorded settlements for the group, newest first. `[]` unless caller is a member. */
  async listByGroup(userId: string, groupId: string): Promise<Settlement[]> {
    if (!isUuid(groupId)) return [];
    if (!(await isActiveMember(this.db, userId, groupId))) return [];

    const rows = await this.db
      .select()
      .from(settlementsTable)
      .where(eq(settlementsTable.groupId, groupId))
      .orderBy(desc(settlementsTable.createdAt));

    return rows.map(toSettlement);
  }

  _clearStore(): void {
    throw new Error(
      "_clearStore is test-only; the vitest setup swaps in the in-memory double",
    );
  }
}

export const settlementsRepo = new SettlementsRepository();
