# Design: FSRS State Preservation & Public Set Discovery

**Date:** 2026-06-29
**Branch:** develop

---

## Overview

Three related improvements:

1. **FSRS state preservation** — editing a set currently wipes all spaced-repetition history for every card in it.
2. **Unauthenticated guest notice** — guests studying a public set get no feedback when learning features silently fail.
3. **Public set discovery** — authenticated users have no way to browse sets created by other users without knowing the direct URL.

---

## Feature 1 — FSRS State Preservation During Set Edit

### Problem

`SetsController.updateSet` ([sets.controller.ts:390–403](../../../apps/api/src/app/sets/sets.controller.ts)) uses a delete-all + recreate-all strategy when cards are included in the PATCH body:

```
deleteMany { setId }   ← cascades into CardFsrsState (onDelete: Cascade)
createMany [ ...cards ]
```

Every `CardFsrsState` row for every card in the set is destroyed on every save, even when the card content did not change.

### Fix

Replace the delete-all + recreate-all pattern with a three-way diff against the existing cards in the database.

**Three cases, resolved in this order:**

| Case | Action |
|---|---|
| Card exists in DB, **not present** in request body | Delete the card (FSRS cascade is correct here — card is gone) |
| Card present in body **with an existing ID** | Update `term`, `definition`, `index` only — ID is preserved, FSRS state survives |
| Card present in body **without an ID** | Create as a new card (new UUID, no prior FSRS state) |

**Scope:** Backend only. `sets.controller.ts` `updateSet` method. No schema change. No new endpoints. The `CardWithIdValidator` DTO already carries an optional `id`, and the frontend already sends it for existing cards (`study-set.component.ts:315–323`).

**Media handling:** Media scan/upload and media deletion logic runs identically on a per-card basis during the diff; the only change is how the DB writes are structured.

---

## Feature 2 — Guest Notice for Learning Features

### Problem

Non-authenticated users can browse and flip cards on any public set. When they reach FSRS-gated UI (rating buttons, review stats), the API returns 401 and the frontend does nothing visible.

### Fix

**Backend:** No change. FSRS endpoints already correctly require `AuthenticatedGuard`.

**Frontend — affected components:**

- `study-set-flashcards.component` — FSRS rating buttons (`rateCard`)
- `study-set-study.component` — FSRS rating submission at mastery
- `study-set.component` — FSRS stats badges (new/due/overdue counts)

**Behaviour:**

1. During `ngOnInit`, each component calls `UsersService.myUser()` to determine auth state. A new boolean `isGuest` is set to `true` when the response is `null` (unauthenticated).
2. When `isGuest` is `true`, a dismissable Bootstrap info alert is rendered at the top of the page:

   > *"Spaced repetition and learning progress require an account. Ask the administrator of this webpage to create one for you."*

3. FSRS rating buttons are hidden (not disabled) for guests. Card browsing and flipping are unaffected.
4. The alert is dismissable (standard Bootstrap `alert-dismissible` with a close button). No persistence across page loads is needed — it will reappear on revisit, which is acceptable.

---

## Feature 3 — Public Set Discovery Page

### Backend

**New endpoint:** `GET /api/sets/public`

- Protected by `AuthenticatedGuard` (returns 401 for unauthenticated requests).
- Query parameters:

  | Param | Type | Default | Description |
  |---|---|---|---|
  | `search` | string | `""` | Matches against set title OR author username (case-insensitive, partial match) |
  | `sort` | `newest` \| `oldest` \| `most_cards` | `newest` | Sort order |
  | `page` | number | `1` | 1-based page index |
  | `limit` | number | `20` | Results per page |

- Response shape per set: `id`, `title`, `description`, `author.username`, `author.id`, `cardCount` (computed from Prisma `_count`), `updatedAt`, `createdAt`.
- A new `PublicSetEntity` response DTO is needed since the existing shared `Set` type does not include `_count` aggregations.
- `private: false` is enforced at the DB query level.
- Returns `{ status, data: { sets: PublicSetEntity[], total: number, page: number, limit: number } }` using the existing `ApiResponse` wrapper. A new `PublicSetsSuccessResponse` DTO wraps this shape.

**Location:** New method in `SetsService`, new handler in `SetsController`. No new module needed.

### Frontend

**New Angular module + route:** `/explore`

- Added to `app-routing.module.ts` as a lazy-loaded module, consistent with all other routes.
- Route guard redirects unauthenticated users to the landing page.

**Page layout:**

```
[ Search input — debounced 300ms ]   [ Sort: Newest ▾ ]

┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│ Set Title           │  │ Set Title           │  │ Set Title           │
│ by username         │  │ by username         │  │ by username         │
│ 42 cards · 2d ago   │  │ 12 cards · 5d ago   │  │ 7 cards · 1mo ago  │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘

[ ← Previous ]                                          [ Next → ]
```

Each card links to `/study-set/:id`. Author username links to `/profile/:authorId`.

Pagination is simple previous/next (no page number input needed for v1).

Search is debounced (300 ms) and re-fetches on change. Sort change re-fetches immediately and resets to page 1.

### Navbar

**Header left side (authenticated users only):**

```
[Logo]  Home  Explore  [Create ▾]
```

**Header right side:**

```
Handbook  v1.x.x  [GitHub]  [Profile ▾]
```

Changes to `header.component.html` and `header.component.ts`:
- Add `routerLink="/explore"` nav link between Home and Create, inside the `*ngIf="signedIn"` block.
- Move the existing Handbook `<a>` from the left `navbar-nav` to the right `d-flex` group, before the version number.

---

## Out of Scope

- Pagination with page number input (next/previous is sufficient for v1).
- Per-tag or per-category filtering (no tag/category model exists).
- Non-authenticated discovery (by explicit decision: discovery requires login).
- Sorting public sets by "popularity" or view count (no view tracking exists).
