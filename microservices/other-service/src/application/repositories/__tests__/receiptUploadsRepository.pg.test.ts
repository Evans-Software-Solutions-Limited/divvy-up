import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { receiptUploads, type Db } from "@divvy-up/db";

import { ReceiptUploadsRepository } from "../receiptUploadsRepository";
import { createTestDb, seedUser } from "./support/pgliteDb";

/** A key shaped exactly as /receipts/upload-url generates them. */
function randomImageKey(): string {
  return `receipts/${crypto.randomUUID()}.jpg`;
}

describe("ReceiptUploadsRepository (PGlite)", () => {
  let db: Db;
  let truncateAll: () => Promise<void>;
  let repo: ReceiptUploadsRepository;

  beforeAll(async () => {
    ({ db, truncateAll } = await createTestDb());
    repo = new ReceiptUploadsRepository(db);
  });

  afterEach(async () => {
    await truncateAll();
  });

  it("record then isOwner(sameUser) is true", async () => {
    const owner = await seedUser(db);
    const imageKey = randomImageKey();

    await repo.record(owner.id, imageKey);

    expect(await repo.isOwner(owner.id, imageKey)).toBe(true);
  });

  it("isOwner(otherUser) is false — no existence leak", async () => {
    const owner = await seedUser(db);
    const otherUser = await seedUser(db);
    const imageKey = randomImageKey();

    await repo.record(owner.id, imageKey);

    expect(await repo.isOwner(otherUser.id, imageKey)).toBe(false);
  });

  it("isOwner(unknownKey) is false", async () => {
    const owner = await seedUser(db);

    expect(await repo.isOwner(owner.id, randomImageKey())).toBe(false);
  });

  it("record is idempotent: recording the same key twice leaves exactly one row", async () => {
    const owner = await seedUser(db);
    const imageKey = randomImageKey();

    await repo.record(owner.id, imageKey);
    await repo.record(owner.id, imageKey);

    const rows = await db
      .select()
      .from(receiptUploads)
      .where(eq(receiptUploads.imageKey, imageKey));
    expect(rows).toHaveLength(1);
    expect(await repo.isOwner(owner.id, imageKey)).toBe(true);
  });
});
