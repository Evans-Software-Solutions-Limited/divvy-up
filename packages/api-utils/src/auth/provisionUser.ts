import { getDb, users, type Db } from "@divvy-up/db";
import type { SupabaseUser } from "./supabaseAuth";

/**
 * First-login provisioning: map a verified Supabase JWT `sub` to a Divvy Up
 * `users` row (`users.id === claims.sub`, no indirection).
 *
 * Idempotent and safe under concurrent first requests — `ON CONFLICT (id) DO
 * NOTHING` means a race between two concurrent first calls for the same
 * `sub` still leaves exactly one row.
 *
 * `SupabaseUser` carries no name claim, so `displayName` is derived from the
 * email local-part.
 */
export async function provisionUser(
  claims: SupabaseUser,
  db: Db = getDb(),
): Promise<{ userId: string }> {
  const displayName = claims.email.split("@")[0];

  await db
    .insert(users)
    .values({
      id: claims.sub,
      email: claims.email,
      displayName,
    })
    .onConflictDoNothing({ target: users.id });

  return { userId: claims.sub };
}
