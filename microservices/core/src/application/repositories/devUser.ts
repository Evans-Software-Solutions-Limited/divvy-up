import { users, type Db } from "@divvy-up/db";

// TODO(auth, phase 2): replace with the authenticated user id from the JWT authorizer
export const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";

/** Anything that exposes `.insert` the way `Db` and a `Db` transaction both do. */
type InsertCapable = Pick<Db, "insert">;

/**
 * Auth is Phase 2 — every row that carries a NOT NULL `created_by` needs a
 * real `users.id` to satisfy the FK. Upsert a stable dev user so writes work
 * before real auth exists. Call this inside every transaction that inserts a
 * row carrying `createdBy`.
 */
export async function ensureDevUser(tx: InsertCapable): Promise<void> {
  await tx
    .insert(users)
    .values({
      id: DEV_USER_ID,
      email: "dev@divvy-up.local",
      displayName: "Dev User",
    })
    .onConflictDoNothing();
}
