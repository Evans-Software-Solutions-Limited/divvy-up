# Tasks — Groups & Members

> Implementation checklist for feature #5. Ordered **frontend-first → backend → wire-up**, each
> task building on the previous. Every task is code/test and references the requirements it
> satisfies. One shippable PR (see `steering/tech.md` delivery model).

## Phase 0 — Contract & mock client

- [ ] 1. Define the shared API/type contract for groups, members and invites
  - Add exported payload types (`Member`, `GroupSummary`, `GroupDetail`, invite payloads) to the
    Elysia app's type surface so eden can consume them; mirror the API Contract in `design.md`.
  - Reconcile `microservices/core/src/domain/types.ts`: extend `Member` with `colourIndex`,
    `isPlaceholder`, `isOwner`, `status`; add `emoji`, `coverIndex`, `currency` (default `GBP`),
    `ownerId` to `Group`.
  - _Requirements: 1.1, 2.1, 5.1, 5.7, 6.1_

- [ ] 2. Build a typed in-memory mock client implementing the full contract
  - Hand-rolled mock matching every endpoint in the contract (list/create/get/update/delete group,
    list/add/remove member, create/preview/accept invite), seeded from the prototype `data.jsx`
    groups/members; assigns colour indexes and converts placeholders so the UI behaves realistically.
  - _Requirements: 1.1, 2.4, 4.1, 5.2, 6.3_

## Phase 1 — Mobile UI against the mock

- [ ] 3. Build the people-colour `Avatar` usage + `AvatarStack` for groups
  - Map `colourIndex` → Tamagui people-palette token (`--p1…--p8`); render initials; dashed ring for
    placeholders; overlapping stack for cards. (Primitive lives in `mobile-app-foundation`; this task
    composes/extends it for member lists.)
  - _Requirements: 1.2, 5.1, 5.5_

- [ ] 4. Build Home group cards
  - Card with emoji, cover colour, avatar stack, your-balance chip (positive/negative/zero polarity
    via `MoneyText`); tap → group detail; loading/error/empty states.
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.8_

- [ ] 5. Build the Groups list screen
  - Full list of the user's groups + persistent "Start a new group" affordance; empty/loading/error.
  - _Requirements: 1.4, 1.5, 1.6_

- [ ] 6. Build the create-group flow
  - Name field, emoji + cover-colour picker (defaults applied), members section pre-seeded with the
    creator, "Add a name (no account needed)" placeholder input + suggested chips; CTA gated until
    name + ≥1 added member ("Add at least one member"); on success navigate to the new group; preserve
    input on error.
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 2.7_

- [ ] 7. Build the manage-group screen
  - Show current name/emoji/cover + member list; rename + emoji/cover edit; add member by name; remove
    member with confirmation; delete group with explicit confirmation; owner-only affordances hidden
    for non-owners.
  - _Requirements: 3.1, 3.2, 3.4, 4.1, 4.2, 4.4_

- [ ] 8. Build the invite (QR/link) and accept-invite screens
  - Invite screen: generate invite (optionally bound to a placeholder seat), render QR + shareable
    link, copy/share, retry on failure. Accept screen: resolve token → group preview → accept → land
    in group; distinguishable expired/used/invalid states.
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.8_

- [ ] 9. Wire TanStack Query hooks to the mock client + component tests
  - `useGroups/useGroup/useCreateGroup/useUpdateGroup/useAddMember/useRemoveMember/useCreateInvite/`
    `useAcceptInvite`; optimistic add-member with rollback. Jest + RN Testing Library tests for card
    balance polarity, placeholder dashed ring, CTA gating, remove confirmation, invite render.
  - _Requirements: 1.1, 1.3, 2.3, 4.1, 4.2, 6.8_

## Phase 2 — Backend (repositories, services, handlers)

- [ ] 10. Implement the pure colour-assignment module + unit tests
  - `assignColourIndex(usedIndexes)` (no clash within active set, deterministic least-recently-used
    cycle past 8) and `initialsFrom(name)` (one/two/many-word, unicode); fully unit-tested.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 11. Rewrite `GroupsRepository` against `packages/db` (Drizzle)
  - Replace the stub: `list/get/create/update/remove` querying `groups` + `group_members`, all scoped
    by `userId` membership (non-member → null/uniform not-found); creator inserted as owner member.
  - _Requirements: 1.7, 2.4, 2.8, 3.5, 7.2, 7.4_

- [ ] 12. Implement `GroupMembersRepository`
  - `listMembers`, `addPlaceholder` (assigns non-clashing colour via the module), `removeMember`
    (owner guard + referenced-member guard → deactivate not delete), `linkUserToMember`,
    `addUserMember`; all membership-scoped.
  - _Requirements: 4.1, 4.3, 4.4, 5.2, 5.6, 7.2_

- [ ] 13. Implement `GroupInvitesRepository`
  - `createInvite` (hashed single-use token + `expires_at`, optional `member_id` binding),
    `findByToken` (by hash), `markUsed`; membership-scoped creation.
  - _Requirements: 6.1, 6.2, 6.6, 6.7_

- [ ] 14. Implement `GroupsService` + `MembersService`
  - GroupsService: create (default emoji/cover, owner member), update/delete owner enforcement,
    list/get mapping with `yourBalance` field (0 until balances feature). MembersService: add
    placeholder, remove with guards.
  - _Requirements: 2.4, 2.6, 2.8, 3.2, 3.3, 4.2, 4.3, 4.4_

- [ ] 15. Implement `InvitesService`
  - Create invite (scoping); accept matrix: already-member no-op (idempotent), placeholder
    conversion preserving `colour_index`/initials/history, new account-linked member with
    non-clashing colour, expired/used/invalid handling, token invalidation.
  - _Requirements: 6.1, 6.3, 6.4, 6.5, 6.6, 5.6_

- [ ] 16. Add Elysia handlers + expand the groups handler surface
  - Thin handlers for all endpoints in the contract with `t` validation and status-code/error-code
    mapping (201/200/204/400/401/403/404/409/410); reuse existing `groups/list` wiring; enforce auth
    identity from the token.
  - _Requirements: 1.7, 3.3, 4.6, 6.4, 7.1, 7.3, 7.4_

- [ ] 17. Backend tests (service + repository + handler)
  - Service: invite acceptance matrix, owner/removal guards. Repository: cross-user scoping rejected,
    placeholder colour non-clash, `linkUserToMember` preserves colour. Handler: status-code mapping
    to the contract.
  - _Requirements: 3.3, 4.3, 5.2, 5.6, 6.3, 6.4, 6.5, 7.2, 7.4_

## Phase 3 — Wire-up & integration

- [ ] 18. Swap the mock client for the real eden client
  - Point the mobile adapter at the real Elysia app types; delete the in-memory mock; confirm all
    hooks/screens compile against the live contract; verify Home/Groups/create/manage/invite work
    end-to-end against the backend.
  - _Requirements: 1.1, 2.5, 4.1, 6.3_

- [ ] 19. End-to-end integration test
  - create → list → add placeholder → invite (bound to placeholder) → accept (conversion) flow against
    the real backend; assert non-member is denied (uniform not-found), colour preserved on conversion,
    and the new group appears on Home with the `yourBalance` field present.
  - _Requirements: 2.4, 5.6, 6.2, 6.3, 7.2, 7.4_

- [ ] 20. Quality gates green
  - Vitest backend coverage at the repo threshold, mobile Jest thresholds, typecheck + lint +
    prettier pass, CI green; spec marked implemented in `.kiro/specs/README.md` status.
  - _Requirements: 1.1, 5.1, 6.3, 7.2_
