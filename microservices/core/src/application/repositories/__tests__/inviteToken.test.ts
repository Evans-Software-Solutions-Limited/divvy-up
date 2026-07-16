import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { generateInviteToken, hashInviteToken } from "../inviteToken";

describe("generateInviteToken", () => {
  it("produces a URL-safe token (base64url alphabet only)", () => {
    for (let i = 0; i < 50; i++) {
      // base64url: A–Z a–z 0–9 - _ ; never +, /, or = padding.
      expect(generateInviteToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("carries ~256 bits of entropy (43 base64url chars for 32 bytes)", () => {
    expect(generateInviteToken()).toHaveLength(43);
  });

  it("is effectively unique across many draws", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(generateInviteToken());
    expect(seen.size).toBe(1000);
  });
});

describe("hashInviteToken", () => {
  it("is a stable SHA-256 hex digest of the raw token", () => {
    const token = "a-known-token";
    const expected = createHash("sha256").update(token).digest("hex");
    expect(hashInviteToken(token)).toBe(expected);
    expect(hashInviteToken(token)).toHaveLength(64); // 32 bytes hex
  });

  it("is deterministic for the same input", () => {
    const token = generateInviteToken();
    expect(hashInviteToken(token)).toBe(hashInviteToken(token));
  });

  it("differs for different tokens (no collisions on distinct input)", () => {
    expect(hashInviteToken("token-a")).not.toBe(hashInviteToken("token-b"));
  });

  it("never returns the raw token (the hash is not reversible to it)", () => {
    const token = generateInviteToken();
    expect(hashInviteToken(token)).not.toBe(token);
  });
});
