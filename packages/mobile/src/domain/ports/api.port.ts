import type { Result, ApiError } from "@/shared/errors";

/**
 * ApiPort — minimal generic HTTP-API abstraction for the Divvy Up shell.
 *
 * The mature source app exposed a large domain-specific surface here; the
 * shell keeps only the two generic concerns the boot path needs: injecting
 * the auth token into outbound requests and the account-deletion call wired
 * into `useAuth`. Feature endpoints are added per-milestone.
 */
export interface ApiPort {
  /**
   * Register a provider that resolves the current access token (or null).
   * Called once at provider-wiring time so the adapter can attach a bearer
   * token to each outbound request.
   */
  setTokenProvider(provider: () => Promise<string | null>): void;

  /**
   * Permanently delete the signed-in user's account server-side.
   * Wired into `useAuth().deleteAccount`.
   */
  deleteAccount(): Promise<Result<void, ApiError>>;
}
