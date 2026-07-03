import {
  UpdateType,
  type AbstractPowerSyncDatabase,
  type CrudEntry,
  type PowerSyncBackendConnector,
  type PowerSyncCredentials,
} from "@powersync/react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupabaseAuthAdapter } from "@/adapters/auth";

/**
 * Postgres error codes PowerSync's retry loop can never recover from by
 * retrying the same write (bad data / constraint violation / RLS denial) —
 * discard the offending op instead of blocking the upload queue forever.
 * See https://docs.powersync.com (Supabase connector guide).
 */
const FATAL_RESPONSE_CODES = [
  // Class 22 — Data Exception (e.g. type mismatch).
  /^22...$/,
  // Class 23 — Integrity Constraint Violation (NOT NULL, FK, UNIQUE).
  /^23...$/,
  // 42501 — insufficient privilege, typically a row-level security denial.
  /^42501$/,
];

/**
 * PowerSync ↔ Supabase connector. Bridges the local PowerSync SQLite DB and
 * `packages/db`'s Supabase Postgres:
 * - `fetchCredentials()` gets the PowerSync endpoint + a session JWT — reuses
 *   the existing `SupabaseAuthAdapter` rather than managing its own session.
 * - `uploadData()` drains PowerSync's local write queue to Supabase via
 *   `supabase-js` CRUD calls (insert/update/delete per queued op).
 *
 * Conflict handling is last-write-wins at the row level (no CRDT machinery
 * needed — see `docs/local-first-sqlite-sync-research.md`).
 */
export class PowerSyncSupabaseConnector implements PowerSyncBackendConnector {
  private readonly client: SupabaseClient;

  constructor(
    private readonly auth: SupabaseAuthAdapter,
    private readonly powersyncUrl: string,
  ) {
    this.client = auth.getClient();
  }

  async fetchCredentials(): Promise<PowerSyncCredentials> {
    const token = await this.auth.getAccessToken();
    if (!token) {
      throw new Error(
        "PowerSyncSupabaseConnector: no Supabase session — user must be signed in before connecting PowerSync",
      );
    }
    return {
      endpoint: this.powersyncUrl,
      token,
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) {
      return;
    }

    let lastOp: CrudEntry | null = null;
    try {
      // Each op is sent as its own Supabase request. If atomicity across a
      // whole transaction ever matters, move it into a Postgres function
      // and call that instead — not needed for this low-concurrency app.
      for (const op of transaction.crud) {
        lastOp = op;
        const table = this.client.from(op.table);
        let result;
        switch (op.op) {
          case UpdateType.PUT:
            result = await table.upsert({ ...op.opData, id: op.id });
            break;
          case UpdateType.PATCH:
            result = await table.update(op.opData ?? {}).eq("id", op.id);
            break;
          case UpdateType.DELETE:
            result = await table.delete().eq("id", op.id);
            break;
        }

        if (result?.error) {
          throw result.error;
        }
      }

      await transaction.complete();
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: unknown }).code)
          : undefined;
      if (code && FATAL_RESPONSE_CODES.some((re) => re.test(code))) {
        // Discard rather than retry forever — this indicates a bug in the
        // write, not a transient failure. Data loss risk is acceptable for
        // this low-concurrency personal-use app; log loudly instead.
        console.error(
          "[PowerSyncSupabaseConnector] Discarding unrecoverable upload:",
          lastOp,
          err,
        );
        await transaction.complete();
        return;
      }
      // Likely transient (network, temporary server error) — rethrow so
      // PowerSync retries after a delay.
      throw err;
    }
  }
}
