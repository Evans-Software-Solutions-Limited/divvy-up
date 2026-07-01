import Constants from "expo-constants";
import { ok, fail, type ApiError, type Result } from "@/shared/errors";
import type { ApiPort } from "@/domain/ports/api.port";

/**
 * Resolve the backend base URL from Expo runtime config or env, falling back
 * to an empty string in dev (callers surface the resulting network error).
 */
export function getApiBaseUrl(): string {
  return (
    (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
    process.env.EXPO_PUBLIC_API_BASE_URL ??
    ""
  );
}

/**
 * Minimal generic REST adapter for the Divvy Up shell.
 *
 * Holds the auth-token provider and implements the single account-deletion
 * endpoint wired into `useAuth`. Feature endpoints are added per-milestone as
 * the domain surface grows back.
 */
export class SSTApiAdapter implements ApiPort {
  private tokenProvider: (() => Promise<string | null>) | null = null;

  setTokenProvider(provider: () => Promise<string | null>): void {
    this.tokenProvider = provider;
  }

  private async authHeader(): Promise<Record<string, string>> {
    const token = (await this.tokenProvider?.()) ?? null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async deleteAccount(): Promise<Result<void, ApiError>> {
    try {
      const res = await fetch(`${getApiBaseUrl()}/account`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(await this.authHeader()),
        },
      });
      if (!res.ok) {
        return fail<ApiError>({
          kind: "api",
          code: "unknown",
          message: `Account deletion failed (HTTP ${res.status})`,
          status: res.status,
        });
      }
      return ok(undefined);
    } catch (err) {
      return fail<ApiError>({
        kind: "api",
        code: "network",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }
}
