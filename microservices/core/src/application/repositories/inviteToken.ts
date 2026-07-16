import { createHash, randomBytes } from "node:crypto";

// ─── Invite token generation + hashing ────────────────────────────────────────
//
// An invite token is a bearer capability: whoever holds the raw string can
// redeem the invite. So the raw token is returned to the creator EXACTLY ONCE
// (at creation) and is NEVER logged or persisted — only its hash is stored, and
// redemption looks the invite up by re-hashing the presented token.

/** 32 bytes = 256 bits of entropy, base64url so it drops straight into a URL. */
const TOKEN_BYTES = 32;

/** A fresh, URL-safe, high-entropy invite token (the raw secret). */
export function generateInviteToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * Hash of a raw invite token, for storage and lookup.
 *
 * A plain SHA-256 (fast) is deliberate and sufficient here — unlike a password,
 * an invite token is a full-entropy 256-bit random value, so there is nothing to
 * brute-force and a slow KDF (bcrypt/argon2) would buy no security while adding
 * latency. The hash exists only so a leaked database never yields a usable token.
 */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
