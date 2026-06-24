# Requirements — Balances & Settle-up

> Feature #8 in the spec index. One shippable PR, frontend-first.
> Depends on #3 `shared-split-engine`, #5 `groups-and-members`, #7 `receipt-review-assignment`.
> Inherits all `.kiro/steering/` context (mobile-first, integer pence, GBP, user-scoped queries).

## Introduction

Once expenses are finalized, members need to see **who owes whom** within a group and to
close out debts. This feature delivers three connected pieces:

1. **Balances** — a per-group screen that aggregates every finalized expense (via the shared
   split engine) into a net position per member, highlights **your** position with the
   semantic money colours (`--pos` owed-to-you / `--neg` you-owe), and breaks the balance down
   per person ("who owes you" / "you owe").
2. **Settle-up** — a flow that records a payment between two members as **mark-as-paid**. This
   is **record-keeping only**: V1 moves **no money**. A recorded settlement adjusts the net
   balances so the pair shows as settled.
3. **Activity feed** — a reverse-chronological list of group events (expenses added,
   settlements recorded, members joined), shown on Home and per group.

The split model is **single-payer**: each finalized expense has one payer, and the other
assigned members owe the payer their item shares. Net balances aggregate these obligations
across many expenses, then subtract recorded settlements. Everything is scoped to the
authenticated user's group memberships.

This feature designs screens not in the prototype's hero path but grounded in it: the
Balances render, the Settle-up sheet (`mark-as-paid`), and the activity feed entries.

---

## Requirements

### Requirement 1 — Net balance aggregation across finalized expenses

**User Story:** As a group member, I want the app to combine every finalized expense in a
group into a single net figure per person, so that I see one true "who owes whom" instead of
a pile of individual receipts.

#### Acceptance Criteria

1. WHEN balances for a group are requested THE SYSTEM SHALL aggregate **only** expenses with
   status `finalized`; draft expenses SHALL be excluded.
2. WHERE an expense is finalized THE SYSTEM SHALL compute each non-payer member's share of
   that expense using the shared split engine (`packages/split-engine`) and record that the
   member owes that amount to the expense's single payer.
3. THE SYSTEM SHALL compute every monetary amount in **integer pence**; per-person shares of
   an expense SHALL sum **exactly** to that expense's total (largest-remainder rounding from
   the split engine — no independent per-share `Math.round`).
4. WHEN a member is the payer on one expense and a debtor on another THE SYSTEM SHALL **net**
   the two directions into a single directed amount per member pair (e.g. if A owes B 500 and
   B owes A 300, the net is A owes B 200).
5. IF the net amount between two members is `0` THEN THE SYSTEM SHALL omit that pair from the
   owed-list (no zero-value rows).
6. THE SYSTEM SHALL express each net balance as a directed pair `{ fromMemberId, toMemberId,
amount }` where `amount` is a positive integer pence value and `from` owes `to`.

### Requirement 2 — Your position, highlighted with semantic colours

**User Story:** As the signed-in user, I want my own net position in the group shown
prominently and colour-coded, so that I can tell at a glance whether I'm owed money or owe it.

#### Acceptance Criteria

1. WHEN the Balances screen loads for a group THE SYSTEM SHALL display the user's **net
   position** in that group as a single signed figure (sum of what others owe the user minus
   what the user owes others).
2. WHILE the user's net position is positive (owed money) THE SYSTEM SHALL render it with the
   `--pos` colour and an "owed to you" framing.
3. WHILE the user's net position is negative (owes money) THE SYSTEM SHALL render it with the
   `--neg` colour and a "you owe" framing.
4. THE SYSTEM SHALL show a per-person breakdown: each other member who owes the user (under
   "who owes you") and each member the user owes (under "you owe"), with that member's
   people-palette avatar and the pence amount formatted as `£x.xx`.
5. WHERE a member in the breakdown is an accountless placeholder THE SYSTEM SHALL still list
   them (rendered per the people-colour system) and label them as invitable.
6. THE SYSTEM SHALL display the count of pairs still to settle alongside the user's position.

### Requirement 3 — Settle-up records a payment (record-keeping only)

**User Story:** As a member, I want to mark a debt as paid, so that the balance reflects that
we squared up outside the app.

#### Acceptance Criteria

1. WHEN the user opens settle-up for a specific person THE SYSTEM SHALL show the direction
   (who pays whom) and the outstanding net amount between that person and the user.
2. WHEN the user confirms "Mark as paid" THE SYSTEM SHALL record a **settlement** with the
   group, the from-member, the to-member, the amount in pence, and a timestamp.
3. THE SYSTEM SHALL treat a settlement as **record-keeping only** and SHALL NOT initiate,
   request, or represent any real money movement; copy SHALL state that V1 records payments
   and no money actually moves.
4. WHEN a settlement is recorded THE SYSTEM SHALL subtract its amount from the net balance
   between those two members so the recomputed balances reflect the settlement.
5. IF a settlement amount exceeds the current outstanding net between the pair THEN THE SYSTEM
   SHALL reject the request with a validation error and record nothing.
6. WHEN a settlement is recorded THE SYSTEM SHALL also append a corresponding activity-feed
   entry (see Requirement 5).
7. THE SYSTEM SHALL allow recording a settlement only between two members of a group the
   authenticated user belongs to.

### Requirement 4 — "All settled" state

**User Story:** As a member, I want a clear "all settled up" state, so that I know there's
nothing outstanding in a group.

#### Acceptance Criteria

1. WHILE every net balance in a group is `0` THE SYSTEM SHALL render an explicit "all settled
   up" state instead of an empty owed-list.
2. WHEN the user's net position is `0` THE SYSTEM SHALL display the position figure as
   `£0.00` in a neutral (non-`pos`/non-`neg`) treatment.
3. WHEN recording the final outstanding settlement brings a group to fully settled THE SYSTEM
   SHALL transition the Balances screen to the "all settled up" state without a full reload.

### Requirement 5 — Activity feed contents and ordering

**User Story:** As a member, I want a feed of what's happened in my groups, so that I can keep
up with new expenses, settlements, and people joining.

#### Acceptance Criteria

1. THE SYSTEM SHALL record an activity entry when an expense is **finalized** (expense added),
   when a **settlement** is recorded, and when a **member joins** a group.
2. THE SYSTEM SHALL store each entry with a type, the acting member, a group reference, an
   optional pence amount, and a creation timestamp.
3. WHEN the activity feed is requested THE SYSTEM SHALL return entries in **reverse
   chronological order** (newest first).
4. WHERE the feed is shown on Home THE SYSTEM SHALL include entries across **all** the user's
   groups; WHERE shown on a group screen THE SYSTEM SHALL include only that group's entries.
5. WHERE an entry is a settlement THE SYSTEM SHALL mark it as settled and render it with the
   `--pos` semantic treatment; expense entries SHALL render with their amount and group.
6. THE SYSTEM SHALL render each entry with the acting member's people-palette avatar, a
   human-readable text line, the amount (where present, formatted `£x.xx`), and a relative
   timestamp.

### Requirement 6 — Ownership scoping

**User Story:** As a user, I want to see balances and activity only for the groups I'm in, so
that other people's data is never exposed to me.

#### Acceptance Criteria

1. THE SYSTEM SHALL scope every balances, settlement, and activity query to the authenticated
   user and their group memberships.
2. IF the authenticated user is not a member of the requested group THEN THE SYSTEM SHALL
   respond with a not-authorized error and return no data.
3. IF a settle-up request references a member or group the user cannot access THEN THE SYSTEM
   SHALL reject it and record nothing.
4. THE SYSTEM SHALL derive the acting user from the verified JWT and SHALL NOT accept a
   caller-supplied user identity in request bodies.
