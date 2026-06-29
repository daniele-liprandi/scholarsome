# FSRS Preservation, Guest Notice & Public Set Discovery — Implementation Plan


**Goal:** Fix FSRS review history being wiped on set edits, notify unauthenticated users that learning features require an account, and add a logged-in-only `/explore` page to browse all public sets.

**Architecture:** Three independent changes sharing no state: (1) a backend-only card upsert rewrite, (2) frontend-only guest banners, (3) a new backend endpoint plus new Angular module plus navbar update. Each task can be reviewed and merged independently.

**Tech Stack:** NestJS + Prisma (MySQL), Angular 15, Bootstrap 5, `ts-fsrs`, `ngx-bootstrap`.

## Global Constraints

- All API responses use `ApiResponse<T>` shape: `{ status: "success"|"fail", data: T }`.
- NestJS exceptions: `throw new XxxException({ status: "fail", message: "..." })`.
- Frontend HTTP services: `lastValueFrom(this.http.get<ApiResponse<T>>(...))`, return `null` on error.
- Angular modules are lazy-loaded; every route gets its own `*RoutingModule`.
- `AuthGuardService` checks the `authenticated` cookie and redirects to `""` (landing) if absent.
- Prisma `relationMode = "prisma"` — no DB-level foreign keys; cascade rules are Prisma-managed.
- Bootstrap alert dismissal: use class `alert alert-info alert-dismissible fade show` with a `<button type="button" class="btn-close" data-bs-dismiss="alert">`.
- Never commit design or plan documents.

---

## File Map

| Task | Action | Path |
|---|---|---|
| 1 | Modify | `apps/api/src/app/sets/sets.controller.ts` |
| 2 | Modify | `apps/front/src/app/study-set/study-set-flashcards/study-set-flashcards.component.ts` |
| 2 | Modify | `apps/front/src/app/study-set/study-set-flashcards/study-set-flashcards.component.html` |
| 2 | Modify | `apps/front/src/app/study-set/study-set-study/study-set-study.component.ts` |
| 2 | Modify | `apps/front/src/app/study-set/study-set-study/study-set-study.component.html` |
| 2 | Modify | `apps/front/src/app/study-set/study-set.component.html` |
| 3 | Create | `apps/api/src/app/sets/dto/publicSetsQuery.dto.ts` |
| 3 | Create | `apps/api/src/app/sets/response/public-set.sets.entity.ts` |
| 3 | Create | `apps/api/src/app/sets/response/success/public-sets.success.response.ts` |
| 3 | Modify | `apps/api/src/app/sets/sets.service.ts` |
| 3 | Modify | `apps/api/src/app/sets/sets.controller.ts` |
| 4 | Create | `apps/front/src/app/shared/http/explore.service.ts` |
| 4 | Create | `apps/front/src/app/explore/explore-routing.module.ts` |
| 4 | Create | `apps/front/src/app/explore/explore.module.ts` |
| 4 | Create | `apps/front/src/app/explore/explore.component.ts` |
| 4 | Create | `apps/front/src/app/explore/explore.component.html` |
| 4 | Create | `apps/front/src/app/explore/explore.component.scss` |
| 4 | Modify | `apps/front/src/app/app-routing.module.ts` |
| 5 | Modify | `apps/front/src/app/header/header.component.html` |

---

## Task 1: Fix FSRS State Preservation in `updateSet`

**Files:**
- Modify: `apps/api/src/app/sets/sets.controller.ts:356–486`

**Context:** The current `updateSet` calls `deleteMany` on all cards before recreating them. Because `CardFsrsState` has `onDelete: Cascade` on `Card`, every review history row is deleted on every save. The fix replaces delete-all + create-all with a three-way diff: delete removed cards, update existing cards (preserving their IDs and therefore their FSRS states), create new cards.

- [ ] **Step 1: Open `apps/api/src/app/sets/sets.controller.ts` and locate lines 356–486** (the section beginning `const newMedia: string[] = []` through the closing `}`of `updateSet`).

- [ ] **Step 2: Replace lines 356–486 with the following block**

```typescript
    const newMediaEntries: { name: string; cardId: string }[] = [];

    if (body.cards) {
      const existingCards = await this.cardsService.cards({ where: { setId: set.id } });
      const existingCardIds = new Set(existingCards.map((c) => c.id));
      const bodyCardIds = new Set(body.cards.filter((c) => c.id).map((c) => c.id as string));

      // Cards present in DB but absent from the request body → delete
      // Storage files are cleaned up here; CardFsrsState cascades automatically via Prisma
      const cardIdsToDelete = existingCards
          .filter((c) => !bodyCardIds.has(c.id))
          .map((c) => c.id);

      for (const cardId of cardIdsToDelete) {
        const card = existingCards.find((c) => c.id === cardId);
        if (card?.media) {
          for (const mediaFile of card.media) {
            await this.cardsService.deleteMedia(set.id, mediaFile.name);
          }
        }
        await this.cardsService.deleteCard({ id: cardId });
      }

      // Cards present in body with a known ID → update in-place (FSRS state survives)
      const cardsToUpdate = body.cards.filter((c) => c.id && existingCardIds.has(c.id));

      for (const card of cardsToUpdate) {
        const completeCard = await this.cardsService.card({ id: card.id });
        if (completeCard) {
          for (const mediaFile of completeCard.media) {
            if (!card.term.includes(mediaFile.name) && !card.definition.includes(mediaFile.name)) {
              await this.cardsService.deleteCardMedia({ id: mediaFile.id });
              await this.cardsService.deleteMedia(set.id, mediaFile.name);
            }
          }
        }

        let termContent = card.term;
        let defContent = card.definition;

        const scannedTerm = await this.cardsService.scanAndUploadMedia(card.term, set.id);
        if (scannedTerm) {
          termContent = scannedTerm.scanned;
          newMediaEntries.push(...scannedTerm.media.map((n) => ({ name: n, cardId: card.id as string })));
        }

        const scannedDef = await this.cardsService.scanAndUploadMedia(card.definition, set.id);
        if (scannedDef) {
          defContent = scannedDef.scanned;
          newMediaEntries.push(...scannedDef.media.map((n) => ({ name: n, cardId: card.id as string })));
        }

        await this.cardsService.updateCard({
          where: { id: card.id as string },
          data: { index: card.index, term: termContent, definition: defContent }
        });
      }

      // Cards present in body without an ID → create new
      const cardsToCreate = body.cards.filter((c) => !c.id || !existingCardIds.has(c.id));

      for (const card of cardsToCreate) {
        let termContent = card.term;
        let defContent = card.definition;

        const scannedTerm = await this.cardsService.scanAndUploadMedia(card.term, set.id);
        if (scannedTerm) {
          termContent = scannedTerm.scanned;
        }

        const scannedDef = await this.cardsService.scanAndUploadMedia(card.definition, set.id);
        if (scannedDef) {
          defContent = scannedDef.scanned;
        }

        const created = await this.cardsService.createCard({
          index: card.index,
          term: termContent,
          definition: defContent,
          set: { connect: { id: set.id } }
        });

        if (scannedTerm) {
          newMediaEntries.push(...scannedTerm.media.map((n) => ({ name: n, cardId: created.id })));
        }
        if (scannedDef) {
          newMediaEntries.push(...scannedDef.media.map((n) => ({ name: n, cardId: created.id })));
        }
      }
    }

    const update = await this.setsService.updateSet({
      where: { id: set.id },
      data: {
        title: body.title,
        description: body.description,
        private: body.private,
        folders: {
          connect: newFolderIDs.map((s) => ({ id: s })),
          disconnect: removedFolderIDs.map((s) => ({ id: s }))
        }
      }
    });

    for (const entry of newMediaEntries) {
      await this.cardsService.createCardMedia({
        card: { connect: { id: entry.cardId } },
        name: entry.name
      });
    }

    return {
      status: ApiResponseOptions.Success,
      data: update
    };
  }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/api && npx tsc --noEmit
```
Expected: no errors in `sets.controller.ts`.

- [ ] **Step 4: Manual smoke test**
  1. Start the app locally.
  2. Create a set with two cards. Study both cards and rate them (so `CardFsrsState` rows exist).
  3. Edit the set: change the term of card 1, add a new card 3, leave card 2 unchanged.
  4. Save. Confirm in the DB (`SELECT * FROM CardFsrsState`) that card 1 and card 2 still have their rows, and card 3 has none.
  5. Delete card 2 from the set. Save. Confirm card 2's `CardFsrsState` row is gone.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app/sets/sets.controller.ts
git commit -m "fix(api): preserve FSRS state during set edit by upserting cards individually"
```

---

## Task 2: Guest Notice for Learning Features

**Files:**
- Modify: `apps/front/src/app/study-set/study-set-flashcards/study-set-flashcards.component.ts`
- Modify: `apps/front/src/app/study-set/study-set-flashcards/study-set-flashcards.component.html`
- Modify: `apps/front/src/app/study-set/study-set-study/study-set-study.component.ts`
- Modify: `apps/front/src/app/study-set/study-set-study/study-set-study.component.html`
- Modify: `apps/front/src/app/study-set/study-set.component.html`

**Context:** Non-authenticated users can open any public set page and its study modes. FSRS endpoints return 401 silently. We need to add a dismissable info alert and hide FSRS rating controls for guests. `study-set.component.ts` already has `isAuthenticated`; the other two components need a new `isGuest` flag backed by `UsersService.myUser()`.

### 2a — Flashcards component

- [ ] **Step 1: Inject `UsersService` and add `isGuest` to `study-set-flashcards.component.ts`**

Add to constructor params:

```typescript
private readonly usersService: UsersService,
```

Add import at top of file:

```typescript
import { UsersService } from "../../shared/http/users.service";
```

Add property after the existing `protected fsrsStates`:

```typescript
protected isGuest = false;
```

In `ngOnInit`, after `const set = await this.sets.set(this.setId)` and before `this.fsrsStates = ...`:

```typescript
    const user = await this.usersService.myUser();
    this.isGuest = !user;

    if (!this.isGuest) {
      this.fsrsStates = await this.fsrsService.getStatesForSet(this.setId);
    }
```

Remove (or guard) the existing bare call:
```typescript
// DELETE this line:
this.fsrsStates = await this.fsrsService.getStatesForSet(this.setId);
```

- [ ] **Step 2: Add guest alert and hide FSRS controls in `study-set-flashcards.component.html`**

Add the alert as the very first element of the template (before any existing `<div>`):

```html
<div *ngIf="isGuest" class="alert alert-info alert-dismissible fade show mx-3 mt-3" role="alert">
  Spaced repetition and learning progress require an account. Ask the administrator of this webpage to create one for you.
  <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
</div>
```

Find every element in the template that calls `rateCard(...)` (the FSRS rating buttons — they appear inside the flashcard session view after the card is flipped). Wrap the containing rating section with `*ngIf="!isGuest"`. The section looks like:

```html
<!-- find the block containing rateCard buttons and wrap it: -->
<div *ngIf="!isGuest" class="...existing classes...">
  <!-- rating buttons: Again, Hard, Good, Easy -->
</div>
```

If the rating buttons are in an `*ngIf="flashcardsMode === 'learn' || ..."` block, add `&& !isGuest` to that condition rather than nesting `*ngIf`.

- [ ] **Step 3: Manual verify — flashcards page as guest**
  1. Log out.
  2. Navigate directly to a public set's flashcards page (`/study-set/:id/flashcards`).
  3. Confirm the info alert appears at the top.
  4. Start a session. Confirm no rating buttons (Again/Hard/Good/Easy) are visible.
  5. Log in. Confirm alert is gone and rating buttons appear.

### 2b — Study component

- [ ] **Step 4: Inject `UsersService` and add `isGuest` to `study-set-study.component.ts`**

Add import:

```typescript
import { UsersService } from "../../shared/http/users.service";
```

Add to constructor params:

```typescript
private readonly usersService: UsersService,
```

Add property after `loaded = false`:

```typescript
isGuest = false;
```

In `ngOnInit`, after `this.aiAvailable = await this.aiService.available()`:

```typescript
    const user = await this.usersService.myUser();
    this.isGuest = !user;
```

The `applyAnswer` method calls `this.fsrsService.submitReview(...)` when a card is mastered. Guard it:

```typescript
    if (this.sessionState.dotsByCardId[cardId] === "mastered" && !this.isGuest) {
      const rating = this.wrongCardIds.has(cardId) ? 2 : 3;
      this.fsrsService.submitReview(cardId, rating as 2 | 3);
    }
```

- [ ] **Step 5: Add guest alert to `study-set-study.component.html`**

Add as the very first element:

```html
<div *ngIf="isGuest" class="alert alert-info alert-dismissible fade show mx-3 mt-3" role="alert">
  Spaced repetition and learning progress require an account. Ask the administrator of this webpage to create one for you.
  <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
</div>
```

- [ ] **Step 6: Manual verify — study page as guest**
  1. Log out.
  2. Navigate to a public set's study page (`/study-set/:id/study`).
  3. Confirm the info alert appears.
  4. Complete a session — no errors thrown, FSRS submit not called (verify in Network tab: no POST to `/api/sets/cards/.../fsrs/review`).

### 2c — Set detail page

- [ ] **Step 7: Add guest alert to `study-set.component.html`**

`study-set.component.ts` already sets `isAuthenticated = true` only when a user is found. Use `!isAuthenticated` as the guest condition.

After the spinner `<div>` (line 1–5) and before the `<div class="container-fluid set-view..." #container hidden>`, insert:

```html
<div *ngIf="!isAuthenticated" class="alert alert-info alert-dismissible fade show mx-3 mt-3" role="alert">
  Spaced repetition and learning progress require an account. Ask the administrator of this webpage to create one for you.
  <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
</div>
```

- [ ] **Step 8: Manual verify — set detail page as guest**
  1. Log out.
  2. Navigate to a public set's detail page (`/study-set/:id`).
  3. Confirm the info alert appears and the FSRS stats dashboard (New/Due/Overdue) is absent (it is already behind `*ngIf="fsrsHasDashboard"` which requires `isAuthenticated`).
  4. Dismiss the alert. Confirm it disappears.

- [ ] **Step 9: Commit**

```bash
git add \
  apps/front/src/app/study-set/study-set-flashcards/study-set-flashcards.component.ts \
  apps/front/src/app/study-set/study-set-flashcards/study-set-flashcards.component.html \
  apps/front/src/app/study-set/study-set-study/study-set-study.component.ts \
  apps/front/src/app/study-set/study-set-study/study-set-study.component.html \
  apps/front/src/app/study-set/study-set.component.html
git commit -m "feat(front): show guest notice on study pages when learning features require auth"
```

---

## Task 3: Public Sets API Endpoint

**Files:**
- Create: `apps/api/src/app/sets/dto/publicSetsQuery.dto.ts`
- Create: `apps/api/src/app/sets/response/public-set.sets.entity.ts`
- Create: `apps/api/src/app/sets/response/success/public-sets.success.response.ts`
- Modify: `apps/api/src/app/sets/sets.service.ts`
- Modify: `apps/api/src/app/sets/sets.controller.ts`

**Context:** No endpoint exists to browse all public sets. We add `GET /api/sets/public` behind `AuthenticatedGuard`. It must be registered *before* `GET /api/sets/:setId` in the controller to avoid NestJS matching "public" as a `setId` param.

- [ ] **Step 1: Create `publicSetsQuery.dto.ts`**

```typescript
// apps/api/src/app/sets/dto/publicSetsQuery.dto.ts
import { IsIn, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";

export class PublicSetsQueryDto {
  @ApiProperty({ required: false, description: "Search by title or author username" })
  @IsString()
  @IsOptional()
    search?: string;

  @ApiProperty({ required: false, enum: ["newest", "oldest", "most_cards"], default: "newest" })
  @IsIn(["newest", "oldest", "most_cards"])
  @IsOptional()
    sort?: "newest" | "oldest" | "most_cards";

  @ApiProperty({ required: false, minimum: 1, default: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
    page?: number;

  @ApiProperty({ required: false, minimum: 1, maximum: 50, default: 20 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  @IsOptional()
    limit?: number;
}
```

- [ ] **Step 2: Create `public-set.sets.entity.ts`**

```typescript
// apps/api/src/app/sets/response/public-set.sets.entity.ts
import { ApiProperty } from "@nestjs/swagger";

export class PublicSetAuthorEntity {
  @ApiProperty({ example: "1e3e00cf-6705-496a-b742-752cb30c6a6b" })
    id: string;

  @ApiProperty({ example: "alice" })
    username: string;
}

export class PublicSetSetsEntity {
  @ApiProperty({ example: "77a72340-0b91-499e-9a06-0eee498d5aec" })
    id: string;

  @ApiProperty({ example: "Spanish Vocabulary" })
    title: string;

  @ApiProperty({ required: false, example: "Useful phrases for travel" })
    description: string | null;

  @ApiProperty({ type: PublicSetAuthorEntity })
    author: PublicSetAuthorEntity;

  @ApiProperty({ example: 42 })
    cardCount: number;

  @ApiProperty({ example: "1970-01-01T00:00:00.000Z" })
    createdAt: Date;

  @ApiProperty({ example: "1970-01-01T00:00:00.000Z" })
    updatedAt: Date;
}
```

- [ ] **Step 3: Create `public-sets.success.response.ts`**

```typescript
// apps/api/src/app/sets/response/success/public-sets.success.response.ts
import { ApiProperty } from "@nestjs/swagger";
import { PublicSetSetsEntity } from "../public-set.sets.entity";

export class PublicSetsData {
  @ApiProperty({ type: [PublicSetSetsEntity] })
    sets: PublicSetSetsEntity[];

  @ApiProperty({ example: 100 })
    total: number;

  @ApiProperty({ example: 1 })
    page: number;

  @ApiProperty({ example: 20 })
    limit: number;
}

export class PublicSetsSuccessResponse {
  @ApiProperty({ example: "success" })
    status: string;

  @ApiProperty({ type: PublicSetsData })
    data: PublicSetsData;
}
```

- [ ] **Step 4: Add `publicSets` method to `sets.service.ts`**

Add the following import at the top of `sets.service.ts` if `Prisma` is not already imported (it is — it's in the existing import):
The existing import `import { Prisma } from "@prisma/client";` covers this.

Add the method after the existing `getSitemapSetInfo` method (around line 104):

```typescript
  async publicSets(params: {
    search?: string;
    sort?: "newest" | "oldest" | "most_cards";
    page?: number;
    limit?: number;
  }): Promise<{
    sets: {
      id: string;
      title: string;
      description: string | null;
      author: { id: string; username: string };
      cardCount: number;
      createdAt: Date;
      updatedAt: Date;
    }[];
    total: number;
  }> {
    const { search = "", sort = "newest", page = 1, limit = 20 } = params;

    const where: Prisma.SetWhereInput = {
      private: false,
      ...(search ? {
        OR: [
          { title: { contains: search } },
          { author: { username: { contains: search } } }
        ]
      } : {})
    };

    const total = await this.prisma.set.count({ where });

    const orderBy: Prisma.SetOrderByWithRelationInput =
      sort === "oldest" ? { createdAt: "asc" } :
      sort === "most_cards" ? { cards: { _count: "desc" } } :
      { createdAt: "desc" };

    const sets = await this.prisma.set.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy,
      include: {
        author: { select: { id: true, username: true } },
        _count: { select: { cards: true } }
      }
    });

    return {
      sets: sets.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description ?? null,
        author: s.author,
        cardCount: s._count.cards,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      })),
      total
    };
  }
```

- [ ] **Step 5: Add `GET /sets/public` handler to `sets.controller.ts`**

Add these imports to the existing import block at the top:

```typescript
import { Query } from "@nestjs/common";
import { PublicSetsQueryDto } from "./dto/publicSetsQuery.dto";
import { PublicSetSetsEntity } from "./response/public-set.sets.entity";
import { PublicSetsSuccessResponse } from "./response/success/public-sets.success.response";
```

Add the handler **before** the existing `@Get(":setId")` handler (i.e., insert it between the `sets()` handler and the `set()` handler):

```typescript
  @Get("public")
  @UseGuards(AuthenticatedGuard)
  @ApiOperation({ summary: "Get all public sets with search and pagination" })
  @ApiOkResponse({ description: "Expected response to a valid request", type: PublicSetsSuccessResponse })
  @ApiUnauthorizedResponse({ description: "Invalid authentication", type: ErrorResponse })
  async publicSets(@Query() query: PublicSetsQueryDto): Promise<ApiResponse<{
    sets: PublicSetSetsEntity[];
    total: number;
    page: number;
    limit: number;
  }>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const result = await this.setsService.publicSets({
      search: query.search,
      sort: query.sort,
      page,
      limit
    });

    return {
      status: ApiResponseOptions.Success,
      data: { ...result, page, limit }
    };
  }
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd apps/api && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: Manual smoke test**
  1. Start the app. Log in.
  2. `GET /api/sets/public` → expect `{ status: "success", data: { sets: [...], total: N, page: 1, limit: 20 } }`.
  3. `GET /api/sets/public?search=test` → returns only sets whose title or author username contains "test".
  4. `GET /api/sets/public?sort=most_cards` → first result has the highest card count.
  5. Log out. `GET /api/sets/public` → expect 401.

- [ ] **Step 8: Commit**

```bash
git add \
  apps/api/src/app/sets/dto/publicSetsQuery.dto.ts \
  apps/api/src/app/sets/response/public-set.sets.entity.ts \
  apps/api/src/app/sets/response/success/public-sets.success.response.ts \
  apps/api/src/app/sets/sets.service.ts \
  apps/api/src/app/sets/sets.controller.ts
git commit -m "feat(api): add GET /sets/public endpoint for authenticated set discovery"
```

---

## Task 4: Explore Page (Frontend)

**Files:**
- Create: `apps/front/src/app/shared/http/explore.service.ts`
- Create: `apps/front/src/app/explore/explore-routing.module.ts`
- Create: `apps/front/src/app/explore/explore.module.ts`
- Create: `apps/front/src/app/explore/explore.component.ts`
- Create: `apps/front/src/app/explore/explore.component.html`
- Create: `apps/front/src/app/explore/explore.component.scss`
- Modify: `apps/front/src/app/app-routing.module.ts`

- [ ] **Step 1: Create `explore.service.ts`**

```typescript
// apps/front/src/app/shared/http/explore.service.ts
import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { lastValueFrom } from "rxjs";
import { ApiResponse, ApiResponseOptions } from "@scholarsome/shared";

export interface PublicSetItem {
  id: string;
  title: string;
  description: string | null;
  author: { id: string; username: string };
  cardCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublicSetsResult {
  sets: PublicSetItem[];
  total: number;
  page: number;
  limit: number;
}

@Injectable({ providedIn: "root" })
export class ExploreService {
  constructor(private readonly http: HttpClient) {}

  async publicSets(params: {
    search?: string;
    sort?: "newest" | "oldest" | "most_cards";
    page?: number;
    limit?: number;
  }): Promise<PublicSetsResult | null> {
    const query = new URLSearchParams();
    if (params.search) query.set("search", params.search);
    if (params.sort) query.set("sort", params.sort);
    if (params.page) query.set("page", params.page.toString());
    if (params.limit) query.set("limit", params.limit.toString());

    try {
      const response = await lastValueFrom(
        this.http.get<ApiResponse<PublicSetsResult>>("/api/sets/public?" + query.toString())
      );
      if (response.status === ApiResponseOptions.Success) return response.data;
      return null;
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 2: Create `explore-routing.module.ts`**

```typescript
// apps/front/src/app/explore/explore-routing.module.ts
import { RouterModule, Routes } from "@angular/router";
import { NgModule } from "@angular/core";
import { ExploreComponent } from "./explore.component";
import { AuthGuardService } from "../auth/auth-guard.service";

const routes: Routes = [
  { path: "", component: ExploreComponent, canActivate: [AuthGuardService] }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ExploreRoutingModule {}
```

- [ ] **Step 3: Create `explore.module.ts`**

```typescript
// apps/front/src/app/explore/explore.module.ts
import { NgModule } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";
import { ExploreComponent } from "./explore.component";
import { ExploreRoutingModule } from "./explore-routing.module";

@NgModule({
  imports: [CommonModule, FormsModule, RouterModule, ExploreRoutingModule],
  declarations: [ExploreComponent]
})
export class ExploreModule {}
```

- [ ] **Step 4: Create `explore.component.ts`**

```typescript
// apps/front/src/app/explore/explore.component.ts
import { Component, OnInit } from "@angular/core";
import { ExploreService, PublicSetItem } from "../shared/http/explore.service";
import { Meta, Title } from "@angular/platform-browser";

@Component({
  selector: "scholarsome-explore",
  templateUrl: "./explore.component.html",
  styleUrls: ["./explore.component.scss"]
})
export class ExploreComponent implements OnInit {
  constructor(
    private readonly exploreService: ExploreService,
    private readonly titleService: Title,
    private readonly metaService: Meta
  ) {}

  sets: PublicSetItem[] = [];
  total = 0;
  page = 1;
  readonly limit = 20;
  loading = true;

  search = "";
  sort: "newest" | "oldest" | "most_cards" = "newest";

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.limit));
  }

  async ngOnInit(): Promise<void> {
    this.titleService.setTitle("Explore — Scholarsome");
    this.metaService.addTag({ name: "description", content: "Browse public study sets shared by other users on Scholarsome." });
    await this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    const result = await this.exploreService.publicSets({
      search: this.search || undefined,
      sort: this.sort,
      page: this.page,
      limit: this.limit
    });
    this.loading = false;
    if (!result) return;
    this.sets = result.sets;
    this.total = result.total;
  }

  onSearchChange(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(async () => {
      this.page = 1;
      await this.load();
    }, 300);
  }

  async onSortChange(): Promise<void> {
    this.page = 1;
    await this.load();
  }

  async prevPage(): Promise<void> {
    if (this.page > 1) {
      this.page--;
      await this.load();
    }
  }

  async nextPage(): Promise<void> {
    if (this.page < this.totalPages) {
      this.page++;
      await this.load();
    }
  }

  formatRelativeTime(dateStr: string): string {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return "today";
    if (diffDays === 1) return "1d ago";
    if (diffDays < 30) return `${diffDays}d ago`;
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) return `${diffMonths}mo ago`;
    return `${Math.floor(diffMonths / 12)}y ago`;
  }
}
```

- [ ] **Step 5: Create `explore.component.html`**

```html
<!-- apps/front/src/app/explore/explore.component.html -->
<div class="container py-4">
  <h2 class="mb-4">Explore sets</h2>

  <div class="d-flex gap-3 mb-4 flex-wrap">
    <input
      type="text"
      class="form-control"
      style="max-width: 400px"
      placeholder="Search by title or author…"
      [(ngModel)]="search"
      (ngModelChange)="onSearchChange()"
    />
    <select
      class="form-select"
      style="max-width: 180px"
      [(ngModel)]="sort"
      (ngModelChange)="onSortChange()"
    >
      <option value="newest">Newest</option>
      <option value="oldest">Oldest</option>
      <option value="most_cards">Most cards</option>
    </select>
  </div>

  <div *ngIf="loading" class="d-flex justify-content-center py-5">
    <div class="spinner-border text-primary" role="status">
      <span class="visually-hidden">Loading…</span>
    </div>
  </div>

  <div *ngIf="!loading && sets.length === 0" class="text-muted py-5 text-center">
    No public sets found.
  </div>

  <div *ngIf="!loading && sets.length > 0">
    <div class="row row-cols-1 row-cols-md-4 g-4">
      <div class="col" *ngFor="let set of sets">
        <div
          class="card shadow-sm h-100 set-card"
          [routerLink]="['/study-set', set.id]"
          role="button"
        >
          <div class="card-body d-flex flex-column">
            <h5 class="card-title text-truncate">{{ set.title }}</h5>
            <p class="text-muted small mb-0">
              by
              <a
                [routerLink]="['/profile', set.author.id]"
                (click)="$event.stopPropagation()"
              >{{ set.author.username }}</a>
            </p>
          </div>
          <div class="card-footer text-muted small d-flex justify-content-between">
            <span>{{ set.cardCount }} card{{ set.cardCount !== 1 ? 's' : '' }}</span>
            <span>{{ formatRelativeTime(set.updatedAt) }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="d-flex justify-content-between align-items-center mt-4">
      <button
        class="btn btn-outline-secondary"
        [disabled]="page <= 1"
        (click)="prevPage()"
      >← Previous</button>
      <span class="text-muted small">Page {{ page }} of {{ totalPages }}</span>
      <button
        class="btn btn-outline-secondary"
        [disabled]="page >= totalPages"
        (click)="nextPage()"
      >Next →</button>
    </div>
  </div>
</div>
```

- [ ] **Step 6: Create `explore.component.scss`**

```scss
// apps/front/src/app/explore/explore.component.scss
.set-card {
  cursor: pointer;
  transition: box-shadow 0.15s ease-in-out;

  &:hover {
    box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15) !important;
  }
}
```

- [ ] **Step 7: Register route in `app-routing.module.ts`**

In `apps/front/src/app/app-routing.module.ts`, add the explore route after the `homepage` entry:

```typescript
{
  path: "explore",
  loadChildren: () => import("./explore/explore.module").then((m) => m.ExploreModule)
},
```

- [ ] **Step 8: Manual verify**
  1. Log in. Navigate to `/explore`.
  2. Confirm the set grid loads with titles, author usernames, card counts, and relative dates.
  3. Type in the search box. After 300 ms debounce, confirm results filter.
  4. Change sort to "Most cards". Confirm the first card has the highest card count.
  5. Log out. Navigate to `/explore`. Confirm redirect to landing page.

- [ ] **Step 9: Commit**

```bash
git add \
  apps/front/src/app/shared/http/explore.service.ts \
  apps/front/src/app/explore/ \
  apps/front/src/app/app-routing.module.ts
git commit -m "feat(front): add /explore page for browsing public sets"
```

---

## Task 5: Navbar Restructure

**Files:**
- Modify: `apps/front/src/app/header/header.component.html`

**Context:** Move "Handbook" from the left nav to the right side (before the version number). Add an "Explore" link on the left, visible only when `signedIn` is true, between "Home" and "Create".

- [ ] **Step 1: Remove "Handbook" from the left `<ul>` and add "Explore"**

In `header.component.html`, in `<ul class="navbar-nav me-auto mb-2 mb-lg-0">`, find the existing Handbook `<li>`:

```html
<li class="nav-item">
  <a class="nav-link text-black" aria-current="page" href="/handbook">Handbook</a>
</li>
```

Remove it entirely from the left `<ul>`.

After the "Home" `<li>` and before the "Create" `<li class="btn-group">`, insert the Explore link:

```html
<li class="nav-item" *ngIf="signedIn">
  <a
    class="nav-link text-black"
    aria-current="page"
    [attr.data-bs-toggle]="isMobile ? 'collapse' : ''"
    [attr.data-bs-target]="isMobile ? '#navbarSupportedContent' : ''"
    [routerLink]="'/explore'"
  >Explore</a>
</li>
```

- [ ] **Step 2: Add "Handbook" to the right `<div class="d-flex align-items-baseline">`**

In the right-side `<div class="d-flex align-items-baseline">`, insert the Handbook link as the **first** child (before the update-available `<a>` and before the version `<span>`):

```html
<a class="nav-link text-black me-2" href="/handbook">Handbook</a>
```

- [ ] **Step 3: Manual verify**
  1. Log in. Confirm left nav shows: Home → Explore → Create.
  2. Confirm right nav shows: Handbook → (update badge if applicable) → version → GitHub → profile.
  3. Log out. Confirm "Explore" link is absent from the left nav.
  4. Click "Handbook". Confirm it navigates to `/handbook`.
  5. Click "Explore" while logged in. Confirm it routes to `/explore`.

- [ ] **Step 4: Commit**

```bash
git add apps/front/src/app/header/header.component.html
git commit -m "feat(front): add Explore nav link and move Handbook to right side of header"
```
