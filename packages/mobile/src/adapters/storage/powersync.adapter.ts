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
 * delete) disconnects and wipes the local DB — callers (see `useAuth`) are
 * expected to call `initialize()` again on the next sign-in, since a fresh
 * session needs a fresh PowerSync connection.
 *
 * The `@azure/core-asynciterator-polyfill` side-effect import is required
 * by PowerSync's watched queries (`db.watch()`), which use async
 * generators — see the RN/Expo setup docs.
 */
type PendingStatusListener = {
  callback: (status: SyncStatus) => void;
  unsubscribe: (() => void) | null;
  cancelled: boolean;
};

export class PowerSyncStorageAdapter implements StoragePort {
  private db: PowerSyncDatabase | null = null;
  // Caches the in-flight/completed init so concurrent callers (app-boot
  // mount effect + useAuth reacting to the bootstrapped session, both of
  // which call `initialize()`) share one connection attempt instead of
  // racing to construct two `PowerSyncDatabase`s. Cleared on `clearAll()`
  // (and on failure) so the *next* `initialize()` call actually re-runs.
  private initPromise: Promise<void> | null = null;
  // Set by `clearAll()` while `disconnectAndClear()` is still tearing down
  // the previous connection; `doInitialize()` waits for it so a fast
  // sign-out → sign-in can't open a *new* `PowerSyncDatabase` against the
  // same SQLite file while the old one is still closing/wiping it.
  private teardownPromise: Promise<void> | null = null;
  // `subscribeStatus()` callers that arrived before `this.db` existed —
  // attached for real once `doInitialize()` completes.
  private pendingStatusListeners = new Set<PendingStatusListener>();

  constructor(
    private readonly auth: SupabaseAuthAdapter,
    private readonly powersyncUrl: string,
  ) {}

  initialize(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.doInitialize().catch((err) => {
        // Let a failed attempt be retried by a later `initialize()` call
        // instead of permanently caching the rejection.
        this.initPromise = null;
        throw err;
      });
    }
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    if (this.teardownPromise) {
      await this.teardownPromise;
    }

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

    // Attach anyone who called `subscribeStatus()` before `db` existed —
    // fire once with the just-connected status, then live-update.
    for (const listener of this.pendingStatusListeners) {
      if (listener.cancelled) continue;
      listener.callback(db.currentStatus);
      listener.unsubscribe = db.registerListener({
        statusChanged: (status) => listener.callback(status),
      });
    }
    this.pendingStatusListeners.clear();
  }

  clearAll(): void {
    const db = this.db;
    this.db = null;
    this.initPromise = null;
    if (!db) return;
    // Not awaited — sign-out shouldn't block on network teardown, and
    // StoragePort#clearAll is synchronous by contract. `doInitialize()`
    // awaits this same promise, so a re-`initialize()` right behind this
    // call still waits for the teardown instead of racing it.
    this.teardownPromise = db
      .disconnectAndClear()
      .catch((err) => {
        console.error(
          "[PowerSyncStorageAdapter] Failed to clear local data:",
          err,
        );
      })
      .finally(() => {
        this.teardownPromise = null;
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
   * offline/blocked-sync banner). Returns an unsubscribe function. Safe to
   * call before `initialize()` resolves (or before it's even been called)
   * — the listener is queued and attached once the DB is ready, instead of
   * being silently dropped.
   */
  subscribeStatus(callback: (status: SyncStatus) => void): () => void {
    if (this.db) {
      return this.db.registerListener({
        statusChanged: (status) => callback(status),
      });
    }

    const listener: PendingStatusListener = {
      callback,
      unsubscribe: null,
      cancelled: false,
    };
    this.pendingStatusListeners.add(listener);
    return () => {
      listener.cancelled = true;
      this.pendingStatusListeners.delete(listener);
      listener.unsubscribe?.();
    };
  }
}
