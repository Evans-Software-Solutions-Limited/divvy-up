# Requirements — Groups & Members

> Feature #5 in the spec sequence (`.kiro/specs/README.md`). Type: FE → BE, one shippable PR.
> Depends on foundations 1–4 (`mobile-app-foundation`, `data-and-persistence`,
> `shared-split-engine`, `authentication`). Inherits all `.kiro/steering/` context.

## Introduction

Groups and members are the backbone Divvy Up hangs everything else on: a receipt is captured
into a group, items are assigned to that group's members, and balances are computed across them.
This feature delivers the full group + member lifecycle on mobile and the backend behind it —
**Home group cards**, the **Groups list**, a **create-group flow**, **manage-group** (rename,
add/remove members), and **invite** (by QR/link, accept-and-join).

Two product primitives are load-bearing and locked by the design HANDOFF:

- **Accountless placeholder members** (HANDOFF Q2 = yes). You can add a _named_ person who has no
  Divvy Up account, assign receipt items to them immediately, and invite them later. When they
  join via an invite, their placeholder **converts in place** to a real account-linked member so
  history and balances are preserved.
- **The people-colour system** is the core visual primitive. Every member has a **stable colour**
  (one of an 8-colour palette, `--p1…--p8`) plus **initials**, rendered as an avatar everywhere
  the person appears. Colours must not clash within a group.

All data access is **scoped to the authenticated user's group memberships** — a user can only
see, mutate, or invite into groups they belong to (per `steering/tech.md`).

This spec inherits but does not redefine: the auth/JWT mechanism (`authentication` spec), the DB
schema and `packages/db` repositories' base wiring (`data-and-persistence` spec), and the ported
component kit / Tamagui theme (`mobile-app-foundation` spec). It **owns** the create/manage-group
and invite designs, which the prototype did not cover.

### Terminology

- **User** — an authenticated Divvy Up account (Supabase Auth `user_id`).
- **Member** — a person _within a group_. May be account-linked (`user_id` set) or a placeholder
  (`user_id` null, `placeholder` true). The same user is a distinct member row per group.
- **Owner** — the member who created the group (the `created_by` user). Has manage/delete rights.
- **colour_index** — integer `0–7` mapping to palette slots `--p1…--p8`.

---

## Requirement 1 — View groups on Home and the Groups list

**User Story:** As a group member, I want to see my groups as rich cards with name, emoji, cover
colour, member avatars and my balance, so that I can pick a group and grasp where I stand at a
glance.

#### Acceptance Criteria

1. WHEN the Home screen mounts THE SYSTEM SHALL request the authenticated user's groups and render
   each as a card showing name, emoji, cover colour, an overlapping stack of member colour-avatars,
   and the user's net balance for that group.
2. THE SYSTEM SHALL display each member avatar using that member's stable people-colour and
   initials, and SHALL render placeholder members with a dashed avatar ring.
3. WHERE the user's net balance in a group is positive THE SYSTEM SHALL present it as "owed to you"
   using the positive money colour; WHERE negative, as "you owe" using the negative money colour;
   WHERE zero, as "all settled up".
4. WHEN the user opens the Groups list THE SYSTEM SHALL render all of the user's groups in a single
   list plus a persistent "Start a new group" affordance.
5. WHILE the groups request is in flight THE SYSTEM SHALL show a loading state, and IF it fails THEN
   THE SYSTEM SHALL show a retry affordance without crashing the screen.
6. IF the user belongs to no groups THEN THE SYSTEM SHALL show an empty state inviting them to
   create their first group.
7. THE SYSTEM SHALL only return groups the authenticated user is a member of.
8. WHEN the user taps a group card THE SYSTEM SHALL navigate to that group's detail/manage view.

---

## Requirement 2 — Create a group

**User Story:** As a user, I want to create a group with a name, emoji, cover colour and an initial
set of members, so that I can start tracking shared expenses with a specific set of people.

#### Acceptance Criteria

1. WHEN the user opens the create-group flow THE SYSTEM SHALL present fields for group name, an
   emoji/cover-colour picker, and a members section pre-populated with the creating user as a member.
2. THE SYSTEM SHALL let the user add a member by typing a name with no account required, creating an
   **accountless placeholder member** for that name.
3. WHILE the group name is empty OR no member besides the creator has been added THE SYSTEM SHALL
   keep the primary action disabled and labelled to explain what is missing (e.g. "Add at least one
   member").
4. WHEN the user confirms creation THE SYSTEM SHALL create the group with the chosen name, emoji and
   cover colour, add the creator as the owner member, persist every added placeholder member, and
   assign each member a non-clashing people-colour.
5. WHEN creation succeeds THE SYSTEM SHALL navigate to the new group and ensure it appears on Home
   and the Groups list.
6. IF the creating user supplies no emoji or cover colour THEN THE SYSTEM SHALL apply a sensible
   default emoji and cover colour rather than rejecting the request.
7. IF creation fails THEN THE SYSTEM SHALL surface a non-destructive error and preserve the user's
   entered name, emoji, cover and member list for retry.
8. THE SYSTEM SHALL set the creator as the group owner.

---

## Requirement 3 — Manage a group (rename, edit emoji/cover, delete)

**User Story:** As a group owner, I want to rename my group and change its emoji and cover colour,
so that it stays recognisable as its purpose evolves.

#### Acceptance Criteria

1. WHEN the owner opens manage-group THE SYSTEM SHALL show the current name, emoji, cover colour and
   the full member list with each member's colour-avatar.
2. WHEN the owner edits the name, emoji or cover colour and saves THE SYSTEM SHALL persist the change
   and reflect it on Home, the Groups list and the group detail.
3. IF a non-owner attempts to rename, re-cover or delete the group THEN THE SYSTEM SHALL reject the
   request with an authorization error.
4. WHEN the owner deletes a group THE SYSTEM SHALL require an explicit confirmation before removing it.
5. IF the user is not a member of the group THEN THE SYSTEM SHALL reject any read or write to it with
   a not-found / not-authorized error (membership scoping).

---

## Requirement 4 — Add and remove members

**User Story:** As a group member, I want to add new people (named placeholders or by invite) and
remove people who shouldn't be in the group, so that the group reflects who is actually sharing
expenses.

#### Acceptance Criteria

1. WHEN a member adds a person by name in manage-group THE SYSTEM SHALL create an accountless
   placeholder member, assign a non-clashing people-colour, and show them in the member list
   immediately.
2. WHEN a member removes another member THE SYSTEM SHALL require confirmation before removal.
3. IF the member to be removed is referenced by any existing expense item assignment or non-zero
   balance THEN THE SYSTEM SHALL block hard deletion and instead either prevent removal with an
   explanatory message or mark the member inactive — never orphaning split history.
4. THE SYSTEM SHALL prevent removing the group owner; ownership transfer is out of scope for V1.
5. WHEN a placeholder member is added THE SYSTEM SHALL make them immediately assignable to receipt
   items (the assignment surface lives in feature #7 but consumes member identity from here).
6. IF a user not in the group attempts to add or remove members THEN THE SYSTEM SHALL reject the
   request with an authorization error.

---

## Requirement 5 — People-colour assignment (8-colour palette, stable, no clashes)

**User Story:** As a user, I want every person in a group to keep one consistent colour and initials,
so that I can recognise who is who instantly across receipts, balances and avatars.

#### Acceptance Criteria

1. THE SYSTEM SHALL maintain a fixed **8-colour people palette** (`colour_index` 0–7 → `--p1…--p8`).
2. WHEN a member is added to a group THE SYSTEM SHALL assign a `colour_index` not already used by an
   active member of that group, so no two active members of the same group share a colour.
3. THE SYSTEM SHALL keep a member's assigned `colour_index` **stable** for the life of their
   membership; it SHALL NOT change on later additions/removals of other members.
4. IF a group already has 8 active members and a 9th is added THEN THE SYSTEM SHALL reuse the palette
   deterministically (cycle), choosing the slot least recently used so visual collisions are minimised.
5. THE SYSTEM SHALL derive a member's initials from their display name (up to two characters),
   recomputing them WHEN the name changes.
6. WHEN a placeholder converts to a real member on invite-accept THE SYSTEM SHALL preserve the
   existing `colour_index` and initials so the person's identity does not visually shift.
7. THE SYSTEM SHALL expose each member's `colour_index` (and derived initials) in every API response
   that returns members, so the mobile client never invents colours.

---

## Requirement 6 — Invite by link / QR and accept

**User Story:** As a group member, I want to invite people by a shareable link or QR code, so that
they can install/open Divvy Up, join the group, and (if they were a placeholder) take over their
existing identity.

#### Acceptance Criteria

1. WHEN a member requests an invite for a group THE SYSTEM SHALL generate an invite carrying a
   single-use, expiring token and return a shareable link and the data needed to render a QR code.
2. WHERE the inviter is filling a specific placeholder member's seat THE SYSTEM SHALL bind the invite
   to that `member_id` so acceptance converts that placeholder rather than creating a duplicate.
3. WHEN an authenticated user opens a valid invite and accepts THE SYSTEM SHALL add them to the group:
   IF the invite is bound to a placeholder member THEN THE SYSTEM SHALL link that member row to the
   accepting user (`user_id` set, `placeholder` false) preserving its `colour_index`, initials and
   history; OTHERWISE THE SYSTEM SHALL create a new account-linked member with a non-clashing colour.
4. IF an invite token is expired, already used, or invalid THEN THE SYSTEM SHALL reject acceptance
   with a clear, distinguishable error for each case and SHALL NOT modify the group.
5. IF the accepting user is already a member of the group THEN THE SYSTEM SHALL treat acceptance as a
   no-op success (idempotent) rather than creating a duplicate membership.
6. WHEN an invite is accepted THE SYSTEM SHALL invalidate the token so it cannot be reused.
7. IF a user who is not a member of the group requests to create an invite for it THEN THE SYSTEM
   SHALL reject the request with an authorization error.
8. WHILE viewing the QR/invite screen THE SYSTEM SHALL let the user copy or share the link, and IF
   the invite cannot be generated THEN THE SYSTEM SHALL show a retry affordance.

---

## Requirement 7 — Ownership and membership scoping (cross-cutting)

**User Story:** As a user, I want my groups and their members to be private to the people in them,
so that no one outside a group can read or change its data.

#### Acceptance Criteria

1. THE SYSTEM SHALL derive the caller's identity from the verified auth token (per the
   `authentication` spec) and SHALL reject any unauthenticated request.
2. THE SYSTEM SHALL scope every group/member read and write to groups the caller is a member of,
   returning not-found / not-authorized for anything outside that scope.
3. THE SYSTEM SHALL restrict group rename, re-cover, delete and member removal to permitted roles
   (owner where specified in Requirements 3–4).
4. THE SYSTEM SHALL never leak the existence of a group or member to a non-member (uniform
   not-found responses for both "absent" and "forbidden" reads).
