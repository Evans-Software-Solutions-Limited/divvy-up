# Next Phase Brief — Build the product screens in `packages/mobile`

> **For a fresh session/agent.** Self-contained handoff. Read top to bottom.
>
> **Hard rule for this repo: frontend work happens in `packages/mobile`, never in
> `packages/web`.** Divvy Up is a mobile app. `packages/web` is a legacy reference
> implementation, kept only so behaviour can be read off it, and deleted once
> mobile reaches parity (`next-phase-brief-powersync.md`). Read the web page,
> then build the mobile screen. Do not "improve" the web page on the way past.
> The only acceptable `packages/web` edit is the minimum needed to keep
> `bun run typecheck` green when a backend contract changes — and say so
> explicitly when you make one.

---

## 1. Where mobile actually is

`packages/mobile` is a shell. It has:

- `app/(auth)/` — `sign-in.tsx`, `sign-up.tsx`, `forgot-password.tsx`
- `app/(app)/(tabs)/` — `index.tsx` and `you.tsx`, both stubs, plus `_layout.tsx`
- `app/(app)/sync-blocked.tsx`
- `src/ui/components/` — a real component library (`Avatar`, `Card`, `Divider`,
  `ErrorState`, `Spacer`, `OAuthButton`, `PLogoDrawLoader`, …), `src/ui/theme`,
  `src/ui/hooks`
- `src/adapters/` — `auth`, `api`, `storage`, `netInfo`, `powersync`
- `src/domain/ports` — `ApiPort` currently exposes only `setTokenProvider` and
  `deleteAccount`

**Every product screen is unbuilt**: Groups list, Group detail, Receipt review /
item assignment, Balances, Settle-up, Activity.

Designs for these are in **Claude Design** (the `claude-design` MCP server). A
session must run `/design consent` before it can read them — an agent without
consent gets an error, not an empty list, so don't conclude "there are no
designs".

## 2. What to build, and the reference for each

| Mobile screen  | Web reference                              | Notes                                                               |
| -------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| Groups list    | `packages/web/src/pages/Home.tsx`          | group cards, member avatar stack, member count                      |
| Group detail   | `packages/web/src/pages/GroupDetail.tsx`   | member roster, add-member, expense list                             |
| Receipt review | `packages/web/src/pages/ReceiptReview.tsx` | the big one: item list, assignment editor, live split bar, finalize |
| Balances       | `packages/web/src/pages/Balances.tsx`      | "who owes whom", settle-up sheet                                    |
| Activity       | `packages/web/src/pages/Activity.tsx`      | per-group feed, server-composed text                                |

The API surface is already built and tested (`microservices/core`). Mobile will
need `ApiPort` widened well beyond its current two methods, or PowerSync-backed
local reads per `next-phase-brief-powersync.md` — decide which, and say why.

## 3. Behaviour contracts the mobile screens MUST honour

These are not style preferences. Each one is a money-correctness or
data-correctness rule that the backend enforces and that a naive port will break.
The web reference already implements all of them; the tests named are the
specification.

### 3.1 Colour comes from `colourIndex`, never array position

`Member` carries a server-assigned `colourIndex` (0..7 → palette slot). Colour by
that field. **Do not** use `members.map((m, i) => colour(i))`: the roster includes
members who have left, so index-derived colour shifts for everyone after them,
and two people can end up the same colour on different screens.

### 3.2 The roster contains former members — filter only where you OFFER a choice

`GET /groups/:id` returns the group's **full** roster, each member flagged
`active`. Former members are returned deliberately: a finalized expense pins its
participants, so someone removed afterwards still owes their frozen share and the
UI has to be able to name them.

- **Naming/display** (balance rows, assignment avatars) → use the full roster.
  Dropping an unresolvable id silently deletes money from the screen.
- **Offering a choice** (payer picker, assignment editor, `everyone` split) →
  filter to `active`. The write path rejects an inactive member outright.
- Member **counts** and the "who's in this group" roster → `active` only.
- Never default a "whose perspective" selector to `members[0]` — it may be someone
  who has left. Pick the first _active_ member.
- Reference: `Balances.tsx` ("Left group" badge), `GroupDetail.tsx` ("Left the
  group" section), `ReceiptReview.tsx` (`roster` vs `members`).

### 3.3 The split preview must match the server penny for penny

Money is integer pence end to end. The split is **largest-remainder**
(`packages/web/src/lib/people.ts` → `splitPence`), and the odd penny goes to the
**earliest participant in the list**. The server resolves and re-reads participants
in **member-id order**, so a client that previews in selection order will show a
1p-different split from the balances that appear after finalizing.

So: sort participants by member id before splitting, for `everyone`, `equal` and
`custom` alike, keeping each weight attached to its member. Reference:
`computeSplit` in `ReceiptReview.tsx`.

### 3.4 Finalizing freezes an `everyone` split

`everyone` means "whoever is in the group" and only survives on a **draft**.
Finalizing materialises it into an explicit `equal` split over the active members,
so a finalized expense's balances never drift when membership changes. Consequences
for the client:

- The finalize request takes **no member list** (that parameter was removed —
  passing one used to be what made a finalized split re-resolvable).
- A finalized expense's items come back as `equal` with explicit members, so
  render the names you're given rather than re-deriving "everyone".

### 3.5 Editing a finalized expense is allowed, and is logged

Assignment edits are **not** blocked after finalizing — it's the only way to fix a
mis-assigned receipt (there is no delete or un-finalize endpoint). But an edit
rewrites who owes whom on an expense that already counts toward balances, so the
server emits an `expense_split_changed` activity row naming both sides of the move
("… — was Sam, now Jordan") with the item's value as `amount`.

**Requirement for mobile, with no web precedent to copy:** warn before saving a
re-split of a **finalized** expense. The web editor does _not_ do this — it only
disables the finalize button once finalized. Don't go looking for a reference
implementation of it: there isn't one.

What web _does_ have, and is worth mirroring, is the adjacent departed-member
case: an amber notice in the item editor when saving would drop a member who has
left, and a `(left)` suffix on their column in the split bar — see
`ReceiptReview.tsx` (search for "has left the group. Saving", not for "warning";
the strings don't use that word).

Handle the new activity kind in the feed (the web feed has a `default` icon case,
so an unhandled kind degrades rather than crashes).

### 3.6 Settle-up is not wired up on the client at all

The `POST /groups/:id/settlements` endpoint exists, is tested, and deliberately
accepts a former member as a counterparty (so a departed member's debt can be
cleared). The **web** settle-up sheet is local optimistic state only — no hook
POSTs to it, so "Settled up ✓" evaporates on reload. **Do not port that.** Mobile
should record settlements for real.

## 4. Testing expectations

- `packages/mobile` uses **jest** (425 tests today) — not vitest. Follow the
  existing patterns under `packages/mobile/__tests__` and `src/**/__tests__`.
- Test the real component, not a re-implementation of its logic. There is a
  cautionary example in web (`ReceiptReview.test.tsx`) that defines its own
  `calculateBalances` with float division, never imports the page, and now
  asserts split semantics the product abandoned. Don't reproduce that shape.
- The money rules in §3.3 deserve direct tests: a total that doesn't divide
  evenly, asserting which member takes the odd penny.

## 5. Gates and process

- Repo root: `bun run typecheck`, `bun run lint`, `bun run prettier:check`
  (fix: `prettier:write`), `bun run test:unit`.
- Run the `inspector-brad` subagent on the branch diff before raising a PR; fix
  every 🔴/🟠/🟡 or justify it, and note the sweep in the PR body.
- Live verification is blocked: there is no Divvy Up Supabase project, so no
  end-to-end smoke against a real backend. Use the iOS Simulator for the mobile
  app itself.
- Commit trailer: `Co-Authored-By: Claude <model> <noreply@anthropic.com>`.
  PR footer: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## 6. Definition of done

- The five screens in §2 exist in `packages/mobile`, built from the designs in
  Claude Design, using the web pages only as a behaviour reference.
- Every contract in §3 holds in mobile, with tests for the money rules.
- Settlements are actually recorded (§3.6).
- No new code in `packages/web`.
