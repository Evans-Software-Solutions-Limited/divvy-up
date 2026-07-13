import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { generateKeyPair, SignJWT } from "jose";

// Integration proof that the REAL `jose` verification path enforces the trust
// claims — not just that `getAuthUser` passes the right options to a mock (the
// sibling `supabaseAuth.test.ts` covers that). Here only `createRemoteJWKSet`
// is stubbed (to serve a locally-generated public key); `jwtVerify` runs for
// real, so a token that is correctly signed but has the wrong `aud`/`iss`, or
// is expired, is rejected by jose itself.
const SUPABASE_URL = "https://proj-under-test.supabase.co";
const ISSUER = `${SUPABASE_URL}/auth/v1`;

// Derive the key type from jose rather than naming the `CryptoKey` global,
// which isn't in api-utils' TS lib (node22 base, no DOM).
type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>;

// Mutable holder so the hoisted `vi.mock` factory can read the key generated in
// `beforeAll`. The real `getJwks()` memoises the resolver; the resolver reads
// `keyHolder.publicKey` at verify time, so memoisation is fine.
const keyHolder: { publicKey?: KeyPair["publicKey"] } = {};

vi.mock("jose", async () => {
  const actual = await vi.importActual<typeof import("jose")>("jose");
  return {
    ...actual,
    createRemoteJWKSet: () => async () => {
      if (!keyHolder.publicKey) throw new Error("test public key not set");
      return keyHolder.publicKey;
    },
  };
});

let privateKey: KeyPair["privateKey"];

async function signToken(claims: {
  sub?: string;
  email?: string;
  aud?: string;
  iss?: string;
  expInPast?: boolean;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ email: claims.email ?? "user@divvy-up.local" })
    .setProtectedHeader({ alg: "ES256" })
    .setSubject(claims.sub ?? "33333333-3333-4333-8333-333333333333")
    .setIssuer(claims.iss ?? ISSUER)
    .setAudience(claims.aud ?? "authenticated")
    .setIssuedAt(now)
    .setExpirationTime(claims.expInPast ? now - 60 : now + 3600)
    .sign(privateKey);
}

beforeAll(async () => {
  process.env.SUPABASE_URL = SUPABASE_URL;
  const { publicKey, privateKey: priv } = await generateKeyPair("ES256", {
    extractable: true,
  });
  keyHolder.publicKey = publicKey;
  privateKey = priv;
});

afterAll(() => {
  delete process.env.SUPABASE_URL;
});

describe("getAuthUser — real jose verification", () => {
  it("accepts a correctly-signed token with the right aud + iss", async () => {
    // Import after the mock + env are in place.
    const { getAuthUser } = await import("../supabaseAuth");
    const token = await signToken({
      sub: "44444444-4444-4444-8444-444444444444",
      email: "real@divvy-up.local",
    });

    const user = await getAuthUser(`Bearer ${token}`);

    expect(user).not.toBeNull();
    expect(user?.sub).toBe("44444444-4444-4444-8444-444444444444");
    expect(user?.email).toBe("real@divvy-up.local");
  });

  it("rejects a token with the wrong audience", async () => {
    const { getAuthUser } = await import("../supabaseAuth");
    const token = await signToken({ aud: "service_role" });
    expect(await getAuthUser(`Bearer ${token}`)).toBeNull();
  });

  it("rejects a token issued by another Supabase project", async () => {
    const { getAuthUser } = await import("../supabaseAuth");
    const token = await signToken({
      iss: "https://someone-elses-project.supabase.co/auth/v1",
    });
    expect(await getAuthUser(`Bearer ${token}`)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const { getAuthUser } = await import("../supabaseAuth");
    const token = await signToken({ expInPast: true });
    expect(await getAuthUser(`Bearer ${token}`)).toBeNull();
  });

  it("rejects a token signed by a different (untrusted) key", async () => {
    const { getAuthUser } = await import("../supabaseAuth");
    const { privateKey: rogueKey } = await generateKeyPair("ES256", {
      extractable: true,
    });
    const now = Math.floor(Date.now() / 1000);
    const rogueToken = await new SignJWT({ email: "attacker@evil.test" })
      .setProtectedHeader({ alg: "ES256" })
      .setSubject("55555555-5555-4555-8555-555555555555")
      .setIssuer(ISSUER)
      .setAudience("authenticated")
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(rogueKey);

    expect(await getAuthUser(`Bearer ${rogueToken}`)).toBeNull();
  });
});
