import { beforeEach, describe, expect, it, vi } from "vitest";

const { jwtVerifyMock, createRemoteJWKSetMock } = vi.hoisted(() => ({
  jwtVerifyMock: vi.fn(),
  createRemoteJWKSetMock: vi.fn(() => "MOCK_JWKS_SET"),
}));

vi.mock("jose", () => ({
  jwtVerify: jwtVerifyMock,
  createRemoteJWKSet: createRemoteJWKSetMock,
}));

const SUPABASE_URL = "https://test-project.supabase.co";
const EXPECTED_ISSUER = `${SUPABASE_URL}/auth/v1`;

const VALID_PAYLOAD = {
  sub: "11111111-1111-1111-1111-111111111111",
  email: "person@example.com",
  email_verified: true,
  iat: 1_700_000_000,
  exp: 1_700_003_600,
};

/** Re-import the module fresh so its module-level `_jwks` singleton resets per test. */
async function freshModule() {
  vi.resetModules();
  return import("../supabaseAuth");
}

describe("supabaseAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createRemoteJWKSetMock.mockReturnValue("MOCK_JWKS_SET");
    process.env.SUPABASE_URL = SUPABASE_URL;
    delete process.env.DivvyUpSupabaseUrl;
  });

  describe("getAuthUser", () => {
    it("resolves claims mapped from a valid token", async () => {
      const { getAuthUser } = await freshModule();
      jwtVerifyMock.mockResolvedValue({ payload: VALID_PAYLOAD });

      const result = await getAuthUser("Bearer good.token.value");

      expect(result).toEqual(VALID_PAYLOAD);
      expect(jwtVerifyMock).toHaveBeenCalledWith(
        "good.token.value",
        "MOCK_JWKS_SET",
        { issuer: EXPECTED_ISSUER, audience: "authenticated" },
      );
    });

    it("returns null and does not call jwtVerify when the header is missing", async () => {
      const { getAuthUser } = await freshModule();

      const result = await getAuthUser(undefined);

      expect(result).toBeNull();
      expect(jwtVerifyMock).not.toHaveBeenCalled();
    });

    it("returns null and does not call jwtVerify when the header is empty", async () => {
      const { getAuthUser } = await freshModule();

      const result = await getAuthUser("");

      expect(result).toBeNull();
      expect(jwtVerifyMock).not.toHaveBeenCalled();
    });

    it("returns null and does not call jwtVerify for a non-Bearer header", async () => {
      const { getAuthUser } = await freshModule();

      const result = await getAuthUser("Basic dXNlcjpwYXNz");

      expect(result).toBeNull();
      expect(jwtVerifyMock).not.toHaveBeenCalled();
    });

    it("returns null when jwtVerify rejects with a bad-signature error", async () => {
      const { getAuthUser } = await freshModule();
      jwtVerifyMock.mockRejectedValue(
        new Error("signature verification failed"),
      );

      const result = await getAuthUser("Bearer bad.signature.token");

      expect(result).toBeNull();
    });

    it("returns null when the token is expired", async () => {
      const { getAuthUser } = await freshModule();
      const expiredError = new Error(
        '"exp" claim timestamp check failed',
      ) as Error & { code: string };
      expiredError.code = "ERR_JWT_EXPIRED";
      jwtVerifyMock.mockRejectedValue(expiredError);

      const result = await getAuthUser("Bearer expired.token.value");

      expect(result).toBeNull();
    });

    it("returns null on an audience mismatch, and asserts jwtVerify was called with the expected issuer/audience options", async () => {
      const { getAuthUser } = await freshModule();
      jwtVerifyMock.mockRejectedValue(
        new Error('unexpected "aud" claim value'),
      );

      const result = await getAuthUser("Bearer wrong-aud.token.value");

      expect(result).toBeNull();
      // The security-critical assertion: jwtVerify must actually be invoked
      // with the issuer/audience constraints, not just called at all — a
      // test that skips this could pass even if aud/iss were never checked.
      expect(jwtVerifyMock).toHaveBeenCalledWith(
        "wrong-aud.token.value",
        "MOCK_JWKS_SET",
        { issuer: EXPECTED_ISSUER, audience: "authenticated" },
      );
    });

    it("returns null on an issuer mismatch, and asserts jwtVerify was called with the expected issuer/audience options", async () => {
      const { getAuthUser } = await freshModule();
      jwtVerifyMock.mockRejectedValue(
        new Error('unexpected "iss" claim value'),
      );

      const result = await getAuthUser("Bearer wrong-iss.token.value");

      expect(result).toBeNull();
      expect(jwtVerifyMock).toHaveBeenCalledWith(
        "wrong-iss.token.value",
        "MOCK_JWKS_SET",
        { issuer: EXPECTED_ISSUER, audience: "authenticated" },
      );
    });

    it("memoises the JWKS: createRemoteJWKSet is called once across multiple getAuthUser calls", async () => {
      const { getAuthUser } = await freshModule();
      jwtVerifyMock.mockResolvedValue({ payload: VALID_PAYLOAD });

      await getAuthUser("Bearer token-one");
      await getAuthUser("Bearer token-two");

      expect(createRemoteJWKSetMock).toHaveBeenCalledTimes(1);
    });

    it("throws (not null) when DivvyUpSupabaseUrl cannot be resolved", async () => {
      const { getAuthUser } = await freshModule();
      delete process.env.SUPABASE_URL;
      delete process.env.DivvyUpSupabaseUrl;

      await expect(getAuthUser("Bearer some.token.value")).rejects.toThrow(
        /DivvyUpSupabaseUrl/,
      );
      expect(jwtVerifyMock).not.toHaveBeenCalled();
    });
  });

  describe("requireAuth", () => {
    it("sets 401 and returns an Unauthorized message when there is no user", async () => {
      const { requireAuth } = await freshModule();
      const ctx = { user: null, set: { status: 200 } };

      const result = requireAuth(ctx);

      expect(ctx.set.status).toBe(401);
      expect(result).toEqual({ message: "Unauthorized" });
    });

    it("returns undefined and leaves status untouched when a user is present", async () => {
      const { requireAuth } = await freshModule();
      const ctx = { user: VALID_PAYLOAD, set: { status: 200 } };

      const result = requireAuth(ctx);

      expect(result).toBeUndefined();
      expect(ctx.set.status).toBe(200);
    });
  });

  describe("getUser", () => {
    it("returns the user when present", async () => {
      const { getUser } = await freshModule();

      expect(getUser({ user: VALID_PAYLOAD })).toBe(VALID_PAYLOAD);
    });

    it("throws when called without a user", async () => {
      const { getUser } = await freshModule();

      expect(() => getUser({ user: null })).toThrow();
    });
  });
});
