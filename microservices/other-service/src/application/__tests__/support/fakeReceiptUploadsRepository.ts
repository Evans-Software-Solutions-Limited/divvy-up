import type { ReceiptUploadsRepository } from "../../repositories/receiptUploadsRepository";

type UploadsRepoOverrides = Partial<
  Pick<ReceiptUploadsRepository, "isOwner" | "record">
>;

/**
 * In-memory fake `ReceiptUploadsRepository` for handler tests — the real
 * repository (against PGlite) is exercised separately in
 * `receiptUploadsRepository.pg.test.ts`. Defaults to "the caller owns the
 * key" and a no-op `record`, so handler tests that don't care about
 * ownership stay green untouched; pass `isOwner`/`record` overrides (e.g. a
 * `vi.fn`) to flip the ownership result or assert a call.
 */
export function fakeReceiptUploadsRepository(
  overrides: UploadsRepoOverrides = {},
): ReceiptUploadsRepository {
  return {
    isOwner: overrides.isOwner ?? (async () => true),
    record: overrides.record ?? (async () => {}),
  } as unknown as ReceiptUploadsRepository;
}
