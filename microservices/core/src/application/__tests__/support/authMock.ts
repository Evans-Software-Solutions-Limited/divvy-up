// Shared auth mock for handler/service tests. `requireAuth` (wired via
// `coreAuth` in every handler plugin — see PART C) now 401s any request
// without a verified user, so every handler test needs one. This mocks only
// the JWT-verification + provisioning boundary (`getAuthUser`/`provisionUser`)
// — `requireAuth`/`getUser` (the pure functions the guard/handlers rely on)
// stay real.
//
// Import this BEFORE importing the handler under test — `vi.mock` is hoisted
// to the top of THIS file, so as long as this import is the first line in a
// test file, the mock is registered before the handler (and its transitive
// `@divvy-up/api-utils/auth` import) is ever loaded.
import { vi } from "vitest";
import type { SupabaseUser } from "@divvy-up/api-utils/auth";

/** Fixed test principal — a valid UUID so it satisfies DB-facing checks. */
export const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
/** A second, distinct principal for ownership-scoping tests. */
export const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";

const USER_BY_TOKEN: Record<string, SupabaseUser> = {
  test: {
    sub: TEST_USER_ID,
    email: "test-user@divvy-up.local",
    email_verified: true,
    iat: 0,
    exp: 0,
  },
  "test-2": {
    sub: OTHER_USER_ID,
    email: "other-user@divvy-up.local",
    email_verified: true,
    iat: 0,
    exp: 0,
  },
};

vi.mock("@divvy-up/api-utils/auth", async () => {
  const actual = await vi.importActual<
    typeof import("@divvy-up/api-utils/auth")
  >("@divvy-up/api-utils/auth");
  return {
    ...actual,
    getAuthUser: vi.fn(async (authHeader?: string) => {
      if (!authHeader?.startsWith("Bearer ")) return null;
      const token = authHeader.slice("Bearer ".length);
      return USER_BY_TOKEN[token] ?? null;
    }),
    provisionUser: vi.fn(async (claims: SupabaseUser) => ({
      userId: claims.sub,
    })),
  };
});

/** `Authorization` header for a mocked verified request. */
export function authHeaders(
  token: "test" | "test-2" = "test",
): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}
