import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Verified Supabase JWT claims — the trusted shape after `jwtVerify` has checked
 * signature, expiry, issuer, and audience. Do NOT confuse this with the
 * decode-only `../jwt/` module, which performs no trust decisions.
 */
export type SupabaseUser = {
  sub: string;
  email: string;
  email_verified: boolean;
  iat: number;
  exp: number;
};

const BEARER_PREFIX = "Bearer ";

/**
 * Resolve the Supabase project URL from the SST Resource (runtime) or an env var.
 * Mirrors `packages/db/src/client.ts`'s `getDatabaseUrl()` pattern.
 *
 * This throws when unresolved. That throw MUST be allowed to propagate out of
 * `getAuthUser` uncaught (see below) — a missing `DivvyUpSupabaseUrl` is a
 * deployment misconfiguration and must surface as a `500`, never a `401`.
 */
function getSupabaseUrl(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Resource } = require("sst");
    if (Resource.DivvyUpSupabaseUrl?.value) {
      return Resource.DivvyUpSupabaseUrl.value;
    }
  } catch {
    // Resource not available (local / tests) — fall through to env var.
  }

  const url = process.env.DivvyUpSupabaseUrl ?? process.env.SUPABASE_URL;
  if (!url) {
    throw new Error(
      "DivvyUpSupabaseUrl is not set. For local dev/tests export SUPABASE_URL " +
        "(or DivvyUpSupabaseUrl), or set the SST secret: " +
        "`sst secret set DivvyUpSupabaseUrl <url>`.",
    );
  }
  return url;
}

/** JWKS key set, cached per warm Lambda instance and reused across invocations. */
let _jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  _jwks ??= createRemoteJWKSet(
    new URL(`${getSupabaseUrl()}/auth/v1/.well-known/jwks.json`),
  );
  return _jwks;
}

/**
 * Verify a `Authorization: Bearer <token>` header against Supabase's JWKS.
 *
 * Returns the verified claims, or `null` for any missing/malformed/invalid
 * token (bad signature, expired, `aud`/`iss` mismatch). Signature + `exp`
 * alone are insufficient — `aud` (must be `"authenticated"`) and `iss` (must
 * be this project's `${SUPABASE_URL}/auth/v1`) are asserted too, or a token
 * from another Supabase project / a non-authenticated token would be trusted.
 *
 * IMPORTANT: resolving the Supabase URL and JWKS happens OUTSIDE the
 * try/catch below. A config error (missing `DivvyUpSupabaseUrl`) must
 * propagate as an uncaught error (→ 500 via the global error handler), never
 * be swallowed into a `null` (→ 401). Only the `jwtVerify` call itself — the
 * actual token-trust decision — is caught.
 */
export async function getAuthUser(
  authHeader: string | undefined,
): Promise<SupabaseUser | null> {
  if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
    return null;
  }
  const token = authHeader.slice(BEARER_PREFIX.length);

  const supabaseUrl = getSupabaseUrl();
  const jwks = getJwks();

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `${supabaseUrl}/auth/v1`,
      audience: "authenticated",
    });

    const { sub, email } = payload;
    if (typeof sub !== "string" || typeof email !== "string" || email === "") {
      // A cryptographically-valid token can still lack a usable `email` claim —
      // Supabase anonymous and phone-only sign-ins do. Those can't be provisioned
      // (`users.email` is NOT NULL) and are out of scope for V1's email + social
      // auth, so reject as unauthorised (401) rather than letting provisioning
      // 500 on every request from that principal.
      console.debug("[auth] verified token missing sub/email claim");
      return null;
    }

    return {
      sub,
      email,
      email_verified: Boolean(payload.email_verified),
      iat: payload.iat as number,
      exp: payload.exp as number,
    };
  } catch (err) {
    // Debug-level log only; a rejected verify (bad sig, expired, aud/iss
    // mismatch, malformed) is an expected outcome, not a server error.
    console.debug("[auth] JWT verification failed", err);
    return null;
  }
}

/**
 * Elysia `.onBeforeHandle` hook. Sets `401` and short-circuits when no
 * verified user is present; otherwise allows the handler to run.
 */
export function requireAuth(ctx: {
  user: SupabaseUser | null;
  set: { status: number };
}): unknown {
  if (!ctx.user) {
    ctx.set.status = 401;
    return { message: "Unauthorized" };
  }
  return undefined;
}

/**
 * Typed reader for handlers that run after `requireAuth` has guaranteed a
 * verified user is present. Throws if called without one (programmer error —
 * `requireAuth` was not wired ahead of this handler).
 */
export function getUser(ctx: { user: SupabaseUser | null }): SupabaseUser {
  if (!ctx.user) {
    throw new Error(
      "getUser() called without a verified user; ensure requireAuth runs first.",
    );
  }
  return ctx.user;
}
