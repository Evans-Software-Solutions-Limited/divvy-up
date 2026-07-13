// Shared auth mock for the other-service handler tests. `requireAuth`
// (wired via `receiptAuth` in every handler plugin — see PART C) now 401s
// any request without a verified user, so every handler test needs one.
// This mocks only the JWT-verification + provisioning boundary
// (`getAuthUser`/`provisionUser`) — `requireAuth` (the pure function the
// guard relies on) stays real.
//
// Import this BEFORE importing the handler under test — `vi.mock` is hoisted
// to the top of THIS file, so as long as this import is the first line in a
// test file, the mock is registered before the handler (and its transitive
// `@divvy-up/api-utils/auth` import) is ever loaded.
import { vi } from "vitest";
import type { SupabaseUser } from "@divvy-up/api-utils/auth";

/** Fixed test principal — a valid UUID so it satisfies DB-facing checks. */
export const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";

const VERIFIED_USER: SupabaseUser = {
  sub: TEST_USER_ID,
  email: "test-user@divvy-up.local",
  email_verified: true,
  iat: 0,
  exp: 0,
};

vi.mock("@divvy-up/api-utils/auth", async () => {
  const actual = await vi.importActual<
    typeof import("@divvy-up/api-utils/auth")
  >("@divvy-up/api-utils/auth");
  return {
    ...actual,
    getAuthUser: vi.fn(async (authHeader?: string) => {
      if (authHeader !== "Bearer test") return null;
      return VERIFIED_USER;
    }),
    provisionUser: vi.fn(async (claims: SupabaseUser) => ({
      userId: claims.sub,
    })),
  };
});

/** `Authorization` header for a mocked verified request. */
export function authHeaders(): Record<string, string> {
  return { Authorization: "Bearer test" };
}
