import "@azure/core-asynciterator-polyfill";
import { PowerSyncDatabase, type SyncStatus } from "@powersync/react-native";
import type { SupabaseAuthAdapter } from "@/adapters/auth";
import { AppSchema, PowerSyncSupabaseConnector } from "@/adapters/powersync";
import type { StoragePort } from "@/domain/ports/storage.port";

const DB_FILENAME = "divvyup.db";

type StatusListener = {
  callback: (status: SyncStatus) => void;
  rawUnsubscribe: (() => void) | null;
};

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
 * Two things make that re-init safe against a fast sign-out ↔ sign-in
 * cycle:
 * - `epoch` is bumped by every `clearAll()`. A `doInitialize()` call that
 *   was already opening/connecting when `clearAll()` fires notices its
 *   captured epoch is stale (checked both before opening and again after
 *   `connect()`), and discards the connection it just built instead of
 *   installing it — otherwise `clearAll()` firing mid-open would see
 *   nothing to tear down yet, and the stale open would resurrect a
 *   connection for a session that's already gone.
 * - `chain` serializes every open/close attempt so at most one is ever in
 *   flight, so two `initialize()` calls (or an `initialize()` racing a
 *   `clearAll()`'s teardown) can't open two `PowerSyncDatabase`s against
 *   the same SQLite file at once.
 * `this.db` itself is still nulled out (and status listeners detached)
 * *synchronously* inside `clearAll()`, before any of that async
 * sequencing — so `getDb()`/`getStatus()` reflect the sign-out
 * immediately, even though the underlying network teardown is
 * best-effort and sequenced behind the scenes.
 *
 * The `@azure/core-asynciterator-polyfill` side-effect import is required
 * by PowerSync's watched queries (`db.watch()`), which use async
 * generators — see the RN/Expo setup docs.
 */
export class PowerSyncStorageAdapter implements StoragePort {
  private db: PowerSyncDatabase | null = null;
  private epoch = 0;
  private chain: Promise<void> = Promise.resolve();
  // Tracked for the adapter's whole lifetime (not just "before the first
  // DB exists") so a listener subscribed against one DB is automatically
  // re-attached to whichever DB replaces it after a clearAll() + re-init —
  // otherwise a still-mounted subscriber would be stuck listening to a
  // disconnected, torn-down instance forever.
  private statusListeners = new Set<StatusListener>();

  constructor(
    private readonly auth: SupabaseAuthAdapter,
    private readonly powersyncUrl: string,
  ) {}

  initialize(): Promise<void> {
    const epoch = this.epoch;
    const result = this.chain.then(() => this.doInitialize(epoch));
    // The stored chain must never become a permanently-rejected promise —
    // that would make every future `.then()` off it (from this call or
    // `clearAll()`) short-circuit without running. Swallow failures there;
    // the caller's own `result` promise still rejects normally.
    this.chain = result.catch(() => undefined);
    return result;
  }

  private async doInitialize(epoch: number): Promise<void> {
    if (this.db || epoch !== this.epoch) return;

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

    if (epoch !== this.epoch) {
      // A clearAll() fired while we were opening/connecting — this
      // connection is for a session that's already gone. Discard it
      // instead of installing it into `this.db`.
      await db.disconnectAndClear().catch((err) => {
        console.error(
          "[PowerSyncStorageAdapter] Failed to discard a stale connection:",
          err,
        );
      });
      return;
    }

    this.db = db;

    // (Re)attach every registered listener to this DB — covers both
    // "subscribed before any DB existed" and "subscribed to a previous DB
    // that clearAll() tore down".
    for (const listener of this.statusListeners) {
      listener.callback(db.currentStatus);
      listener.rawUnsubscribe = db.registerListener({
        statusChanged: (status) => listener.callback(status),
      });
    }
  }

  clearAll(): void {
    this.epoch++;
    const db = this.db;
    this.db = null;
    // Detach from the dying DB immediately — `doInitialize()` re-attaches
    // to whatever DB comes next.
    for (const listener of this.statusListeners) {
      listener.rawUnsubscribe?.();
      listener.rawUnsubscribe = null;
    }
    if (!db) return;
    // Sequenced behind `chain` (not necessarily synchronous) — this way a
    // `doInitialize()` still opening this same `db` can't have its
    // eventual `disconnectAndClear()` race this one, and a subsequent
    // `initialize()` queued right after this call waits its turn behind
    // this teardown instead of opening a new DB while it's still running.
    this.chain = this.chain
      .then(() => db.disconnectAndClear())
      .catch((err) => {
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
   * offline/blocked-sync banner). Returns an unsubscribe function. Safe to
   * call before `initialize()` resolves (or before it's even been called),
   * and keeps working across a `clearAll()` + re-`initialize()` cycle —
   * the listener follows whichever DB is currently live instead of being
   * bound to a single instance.
   */
  subscribeStatus(callback: (status: SyncStatus) => void): () => void {
    const listener: StatusListener = { callback, rawUnsubscribe: null };
    if (this.db) {
      listener.rawUnsubscribe = this.db.registerListener({
        statusChanged: (status) => callback(status),
      });
    }
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
      listener.rawUnsubscribe?.();
    };
  }
}
