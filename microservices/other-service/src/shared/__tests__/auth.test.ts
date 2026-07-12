import { describe, expect, it, vi } from "vitest";
import type { SupabaseUser } from "@divvy-up/api-utils/auth";

// This is the proof that the guard actually covers `.use()`d routes: `app`
// is the REAL composed Elysia instance from api.ts (error handler → openapi
// → receiptAuth → every handler plugin, each of which ALSO `.use()`s
// receiptAuth — see api.ts and shared/auth.ts for why). If root-level
// `.use(receiptAuth)` alone didn't propagate into a separately-authored
// handler plugin, this test would fail even though the plugin looks "wired".
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

describe("receipt-service auth guard coverage (POST /receipts/upload-url)", () => {
  it("401s with no Authorization header", async () => {
    const { app } = await import("../../api");

    const response = await app.handle(
      new Request("http://localhost/receipts/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: "image/jpeg" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ message: "Unauthorized" });
  });

  it("does not 401 with a verified Authorization header", async () => {
    const { app } = await import("../../api");

    // A bad content type is enough to prove the guard let the request
    // through — the real S3ReceiptImagesAdapter rejects it before any AWS
    // call, so this stays 415, never 401, with no AWS credentials needed.
    const response = await app.handle(
      new Request("http://localhost/receipts/upload-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: VALID_TOKEN,
        },
        body: JSON.stringify({ contentType: "application/pdf" }),
      }),
    );

    expect(response.status).not.toBe(401);
    expect(response.status).toBe(415);
  });
});
