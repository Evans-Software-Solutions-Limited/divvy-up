import "@azure/core-asynciterator-polyfill";
import { PowerSyncDatabase, type SyncStatus } from "@powersync/react-native";
import type { SupabaseAuthAdapter } from "@/adapters/auth";
import { AppSchema, PowerSyncSupabaseConnector } from "@/adapters/powersync";
import type { StoragePort } from "@/domain/ports/storage.port";

const DB_FILENAME = "divvyup.db";

/**
 * PowerSync-backed on-device storage adapter for the Divvy Up shell.
 *
 * Replaces the shell's original plain `expo-sqlite` adapter: `initialize()`
 * opens the local SQLite DB (per `AppSchema`) and connects it to Supabase
 * via `PowerSyncSupabaseConnector`, so local reads/writes work offline and
 * sync bidirectionally when online. `clearAll()` (sign-out / account
 * delete) disconnects and wipes the local DB.
 *
 * The `@azure/core-asynciterator-polyfill` side-effect import is required
 * by PowerSync's watched queries (`db.watch()`), which use async
 * generators — see the RN/Expo setup docs.
 */
export class PowerSyncStorageAdapter implements StoragePort {
  private db: PowerSyncDatabase | null = null;

  constructor(
    private readonly auth: SupabaseAuthAdapter,
    private readonly powersyncUrl: string,
  ) {}

  async initialize(): Promise<void> {
    if (this.db) return;

    const db = new PowerSyncDatabase({
      schema: AppSchema,
      database: { dbFilename: DB_FILENAME },
    });
    await db.init();

    const connector = new PowerSyncSupabaseConnector(
      this.auth,
      this.powersyncUrl,
    );
    // Resolves once the connection attempt starts — PowerSync retries
    // `fetchCredentials`/streaming internally (with backoff) and reports
    // failures via `currentStatus`/`registerListener`, so this is safe to
    // call before the user is signed in (e.g. app boot on a fresh install).
    await db.connect(connector);

    this.db = db;
  }

  clearAll(): void {
    const db = this.db;
    this.db = null;
    if (!db) return;
    // Fire-and-forget: sign-out shouldn't block on network teardown, and
    // StoragePort#clearAll is synchronous by contract.
    db.disconnectAndClear().catch((err) => {
      console.error(
        "[PowerSyncStorageAdapter] Failed to clear local data:",
        err,
      );
    });
  }

  /**
   * The underlying PowerSync database, for feature code to run queries and
   * watched queries against. Throws if called before `initialize()`.
   */
  getDb(): PowerSyncDatabase {
    if (!this.db) {
      throw new Error(
        "PowerSyncStorageAdapter: call initialize() before getDb()",
      );
    }
    return this.db;
  }

  /** Current connection/sync status, or null before `initialize()`. */
  getStatus(): SyncStatus | null {
    return this.db?.currentStatus ?? null;
  }

  /**
   * Subscribe to connection/sync status changes (e.g. to drive an
   * offline/blocked-sync banner). Returns an unsubscribe function; a no-op
   * if called before `initialize()`.
   */
  subscribeStatus(callback: (status: SyncStatus) => void): () => void {
    if (!this.db) {
      return () => {};
    }
    return this.db.registerListener({
      statusChanged: (status) => callback(status),
    });
  }
}
