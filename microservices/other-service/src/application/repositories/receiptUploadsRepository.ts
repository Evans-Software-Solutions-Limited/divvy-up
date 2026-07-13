import { and, eq } from "drizzle-orm";
import { getDb, receiptUploads, type Db } from "@divvy-up/db";

/**
 * Binds an S3 `imageKey` to the user who requested its upload URL, so
 * `/receipts/extract` can verify the caller owns the key before reading it —
 * a valid-shaped `receipts/<uuid>.<ext>` key alone must never be sufficient
 * to read another user's receipt image (object-level authz).
 */
export class ReceiptUploadsRepository {
  static readonly key = "ReceiptUploadsRepository";

  private _db?: Db;

  constructor(private readonly injectedDb?: Db) {}

  /** Lazy resolution — `getDb()` must not run at construction time (module import). */
  private get db(): Db {
    if (!this._db) {
      this._db = this.injectedDb ?? getDb();
    }
    return this._db;
  }

  /**
   * Records the uploader of a freshly-issued image key. `onConflictDoNothing`
   * is defensive only — keys are random UUIDs, so a collision won't happen in
   * practice — but it keeps this idempotent rather than throwing on a retry.
   */
  async record(userId: string, imageKey: string): Promise<void> {
    await this.db
      .insert(receiptUploads)
      .values({ imageKey, uploadedBy: userId })
      .onConflictDoNothing({ target: receiptUploads.imageKey });
  }

  /**
   * True iff `imageKey` was uploaded by `userId`. A missing key and a
   * wrong owner both return `false` — no existence leak (mirrors
   * `isGroupMember`/`isActiveMember`'s not-found ≡ not-authorised contract).
   */
  async isOwner(userId: string, imageKey: string): Promise<boolean> {
    const [row] = await this.db
      .select({ imageKey: receiptUploads.imageKey })
      .from(receiptUploads)
      .where(
        and(
          eq(receiptUploads.imageKey, imageKey),
          eq(receiptUploads.uploadedBy, userId),
        ),
      );
    return !!row;
  }
}
