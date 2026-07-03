/**
 * StoragePort — minimal generic on-device storage abstraction for the
 * Divvy Up shell.
 *
 * The mature source app exposed a large local-first cache + sync-queue
 * surface here; the shell keeps only the two lifecycle hooks the boot path
 * needs: `initialize` (open the DB on mount) and `clearAll` (wipe local
 * state on sign-out). Feature reads/writes and the sync queue are added
 * per-milestone.
 */
export interface StoragePort {
  /**
   * Open / migrate the on-device database. Called on app mount, and again
   * whenever a session appears after a `clearAll()` (i.e. sign back in
   * after sign-out/delete-account in the same app session) — implementations
   * must tolerate being called again after `clearAll()` and should be
   * safe to call concurrently (e.g. from both the app-boot effect and the
   * auth state listener).
   */
  initialize(): Promise<void>;

  /** Wipe all locally-cached user data. Called on sign-out / account delete. */
  clearAll(): void;
}
