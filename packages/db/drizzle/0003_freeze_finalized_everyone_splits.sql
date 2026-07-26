-- Data-only backfill (no schema change): freeze `everyone` splits on expenses that
-- were ALREADY finalized before freeze-at-finalize existed.
--
-- Such items carry no item_assignments rows, so their balances were still being
-- resolved against the group's *current* members on every read — meaning a member
-- added or removed later silently rewrote a past expense's split. Materialising the
-- participant set stabilises them from here on. It cannot recover who the members
-- were at the original finalize (that was never recorded), so it freezes today's
-- active members — the same people the read path was already splitting between,
-- now fixed in place. (A single penny of a non-divisible item may land on a
-- different member than the last read showed, since the frozen participant order
-- is by member id; the amount owed in total is unchanged.)
--
-- Drafts are deliberately left alone — `everyone` on a draft still means "whoever is
-- in the group", and drafts don't contribute to balances.
INSERT INTO "item_assignments" ("item_id", "member_id")
SELECT ri."id", gm."id"
FROM "receipt_items" ri
JOIN "expenses" e ON e."id" = ri."expense_id"
JOIN "group_members" gm ON gm."group_id" = e."group_id" AND gm."active" = true
WHERE ri."assignment_mode" = 'everyone'
  AND e."status" = 'finalized'
ON CONFLICT ("item_id", "member_id") DO NOTHING;
--> statement-breakpoint
-- Flip the mode last, so a failure above leaves the rows untouched rather than
-- turning an `everyone` item into an `equal` item with no members.
UPDATE "receipt_items" ri
SET "assignment_mode" = 'equal'
WHERE ri."assignment_mode" = 'everyone'
  AND EXISTS (
    SELECT 1 FROM "expenses" e
    WHERE e."id" = ri."expense_id" AND e."status" = 'finalized'
  );
