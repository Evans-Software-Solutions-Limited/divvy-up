import { desc, eq } from "drizzle-orm";
import {
  getDb,
  activity as activityTable,
  type ActivityRow,
  type Db,
  type NewActivityRow,
} from "@divvy-up/db";
import type { Activity, ActivityKind } from "../../domain/types";
import { isActiveMember } from "./membership";
import { isUuid } from "./isUuid";

// ─── Feed policy (decided for this slice; see brief §5) ────────────────────────
//
// • WHERE we emit — in the repository layer, inside the SAME transaction as the
//   triggering mutation (finalize / settle / member-add). A rolled-back mutation
//   leaves no orphan feed row and a committed one always has its row. Emitting in
//   the handler after the repo call would risk partial writes and miss shared
//   code paths (e.g. join-by-link, which never touches the members handler).
//   `recordActivity` therefore takes a `Db`/tx handle rather than resolving its
//   own — it participates in the caller's transaction.
//
// • TEXT is snapshotted server-side at write time with member names frozen in,
//   so the feed reads as it did then even after a rename/removal (see composers
//   below). `amount` (pence) is kept populated where an event has one so a client
//   can reformat; it is display metadata only, never a balance input.
//
// • READS are member-gated exactly like settlements: `[]` for non-members so
//   group existence isn't leaked.
//
// • PAGINATION — V1 is a simple newest-first `limit` (default 50), NOT a cursor.
//   This returns "the most recent N", not a page into full history; for a
//   personal-use app with low event volume that's a conscious, documented choice.
//   Ordered by `createdAt` desc with `id` desc as a deterministic tie-break so
//   equal-timestamp rows never reorder between reads.
//
// • NO BACKFILL — the feed is forward-only from ship; existing groups have no
//   rows for past events, by design.

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Formats integer pence as `£X.XX` (magnitude only). The app is GBP end to end. */
export function gbp(pence: number): string {
  return (
    "£" +
    (Math.abs(pence) / 100).toLocaleString("en-GB", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/**
 * The exact feed wording, centralised so it stays consistent across the four
 * emit sites. Each composer receives already-resolved member names (snapshotted
 * by the caller inside its transaction).
 */
export const activityText = {
  /** e.g. "Alex finalized Dinner — £48.00" */
  expenseAdded: (actorName: string, description: string, totalPence: number) =>
    `${actorName} finalized ${description} — ${gbp(totalPence)}`,
  /** e.g. "Sam paid Alex £12.00" */
  settledUp: (fromName: string, toName: string, amountPence: number) =>
    `${fromName} paid ${toName} ${gbp(amountPence)}`,
  /** Direct add: e.g. "Alex added Jordan" */
  memberAdded: (actorName: string, subjectName: string) =>
    `${actorName} added ${subjectName}`,
  /** Join-by-link: the actor is the joiner. e.g. "Jordan joined" */
  memberJoined: (name: string) => `${name} joined`,
} as const;

/** Anything exposing `.insert` the way a `Db` and a `Db` transaction both do. */
type InsertCapable = Pick<Db, "insert">;

export type RecordActivityInput = {
  groupId: string;
  actorMemberId: string;
  kind: ActivityKind;
  text: string;
  /** Pence; omit/null for events without a monetary amount (member_added). */
  amount?: number | null;
  expenseId?: string | null;
  settlementId?: string | null;
};

/**
 * Appends one activity row using the caller's `Db`/tx handle so the write is
 * atomic with the triggering mutation. No auth here — the caller already
 * authorized (and is mid-transaction on) the event being recorded.
 */
export async function recordActivity(
  executor: InsertCapable,
  input: RecordActivityInput,
): Promise<void> {
  const values: NewActivityRow = {
    groupId: input.groupId,
    actorMemberId: input.actorMemberId,
    kind: input.kind,
    text: input.text,
    amount: input.amount ?? null,
    expenseId: input.expenseId ?? null,
    settlementId: input.settlementId ?? null,
  };
  await executor.insert(activityTable).values(values);
}

function toActivity(row: ActivityRow): Activity {
  return {
    id: row.id,
    groupId: row.groupId,
    actorMemberId: row.actorMemberId,
    kind: row.kind,
    text: row.text,
    amount: row.amount,
    expenseId: row.expenseId,
    settlementId: row.settlementId,
    createdAt: row.createdAt.toISOString(),
  };
}

export class ActivityRepository {
  static readonly key = "ActivityRepository";

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
   * The group's activity feed, newest first. `[]` unless the caller is an active
   * member (existence not leaked). `limit` is clamped to [1, {@link MAX_LIMIT}];
   * this returns the most recent N rows, not a page into full history.
   */
  async listByGroup(
    userId: string,
    groupId: string,
    limit: number = DEFAULT_LIMIT,
  ): Promise<Activity[]> {
    if (!isUuid(groupId)) return [];
    if (!(await isActiveMember(this.db, userId, groupId))) return [];

    const capped = Math.min(
      Math.max(Math.trunc(limit) || DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );

    const rows = await this.db
      .select()
      .from(activityTable)
      .where(eq(activityTable.groupId, groupId))
      // createdAt desc, id desc → deterministic order for equal timestamps.
      .orderBy(desc(activityTable.createdAt), desc(activityTable.id))
      .limit(capped);

    return rows.map(toActivity);
  }

  _clearStore(): void {
    throw new Error(
      "_clearStore is test-only; the vitest setup swaps in the in-memory double",
    );
  }
}

export const activityRepo = new ActivityRepository();
