import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseUser } from "@divvy-up/api-utils/auth";
import type { app as CoreApp } from "../../api";

// This is the proof that the guard actually covers `.use()`d routes: `app`
// is the REAL composed Elysia instance from api.ts (error handler → openapi
// → coreAuth → every handler plugin, each of which ALSO `.use()`s coreAuth —
// see api.ts and shared/auth.ts for why). If root-level `.use(coreAuth)`
// alone didn't propagate into a separately-authored handler plugin, this
// test would fail even though the plugin looks "wired".
const VALID_TOKEN = "Bearer valid-token";
const VERIFIED_USER: SupabaseUser = {
  sub: "11111111-1111-4111-8111-111111111111",
  email: "auth-guard-test@divvy-up.local",
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
      if (authHeader !== VALID_TOKEN) return null;
      return VERIFIED_USER;
    }),
    provisionUser: vi.fn(async (claims: SupabaseUser) => ({
      userId: claims.sub,
    })),
  };
});

// Importing `../../api` composes the whole app graph (openapi + every handler
// plugin) — a ~1.3s cold cost locally, far more under loaded CI runners. Done
// inside each `it()` it raced the 5s per-test timeout and flaked; hoisting it
// into `beforeAll` runs it ONCE, under the (generous, explicit) hook timeout,
// so each test only pays for `app.handle()`.
let app: typeof CoreApp;

beforeAll(async () => {
  ({ app } = await import("../../api"));
}, 30_000);

describe("core auth guard coverage (GET /groups)", () => {
  it("401s with no Authorization header", async () => {
    const response = await app.handle(new Request("http://localhost/groups"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ message: "Unauthorized" });
  });

  it("does not 401 with a verified Authorization header", async () => {
    const response = await app.handle(
      new Request("http://localhost/groups", {
        headers: { Authorization: VALID_TOKEN },
      }),
    );

    expect(response.status).not.toBe(401);
  });
});
