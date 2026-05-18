# AI Quiz Enrichment — Design Spec

**Date:** 2026-05-18
**Status:** approved

## Overview

Add an optional AI enrichment layer to the quiz feature. When enabled, the LLM:
- rephrases card terms/definitions into natural-language question form with varied wording
- generates three plausible wrong answers for multiple choice questions

All other quiz behaviour (written, true/false, scoring, settings) stays unchanged. AI mode is opt-in per quiz run via a toggle in the quiz configuration form.

---

## Configuration

Three env vars in `.env` (all already present):

| Var | Purpose |
|---|---|
| `LLM_BASE_URL` | Base URL of the OpenAI-compatible API (no trailing slash) |
| `LLM_AUTH_TOKEN` | Bearer token |
| `LLM_MODEL` | Model name passed in every request |

If `LLM_BASE_URL` is absent, `AiService` skips initialisation and `GET /api/ai/available` returns `false`. The frontend hides the AI toggle in that case.

---

## Shared type

Added to `libs/shared/src/lib/types/api/`:

```typescript
// ai-enriched-card.ts
export interface AiEnrichedCard {
  cardId: string;
  termQuestion: string;        // question form when term is shown, definition is the answer
  definitionQuestion: string;  // question form when definition is shown, term is the answer
  termDistractors: string[];   // 3 plausible wrong terms
  definitionDistractors: string[]; // 3 plausible wrong definitions
}
```

Re-exported from `libs/shared/src/index.ts`.

---

## Backend

### New module: `apps/api/src/app/providers/ai/`

**`ai.module.ts`**
- imports `HttpModule` (`@nestjs/axios`), `SetsModule`
- provides `AiService`, `AiController`
- imported into `AppModule`

**`ai.service.ts`**

Dependencies injected: `HttpService`, `ConfigService`, `InjectRedis()` (default namespace), `SetsService`.

On module init (`onModuleInit`): reads `LLM_BASE_URL` from config. If absent, sets `this.available = false` and skips all LLM calls.

Methods:

`isAvailable(): boolean` — returns `this.available`.

`enrich(setId: string, requestingUserId: string): Promise<AiEnrichedCard[]>`
1. Check Redis key `ai:{setId}`. If hit, parse and return.
2. Load set via `SetsService.set(setId)`. Throws `NotFoundException` if not found.  
   Access check: if `set.private && set.authorId !== requestingUserId` throw `ForbiddenException`.
3. Strip HTML from each card's `term` and `definition` (`replace(/<[^>]+>/g, '').trim()`).
4. Build a single chat completion request — one system prompt describing the task, one user message with all cards as a JSON array. Request `response_format: { type: "json_object" }`.
5. POST to `${LLM_BASE_URL}/v1/chat/completions` with `Authorization: Bearer ${LLM_AUTH_TOKEN}`, model from `LLM_MODEL`.
6. Parse response. Validate that each entry has the four required fields. Entries that fail validation are dropped (missing cards fall back to local generation on the frontend).
7. Write to Redis: `SET ai:{setId} <json> EX 86400`. Redis errors are swallowed — a failed cache write does not fail the request.
8. Return `AiEnrichedCard[]`.

Error paths:
- LLM call fails (network / 5xx / timeout): rethrow as `BadGatewayException`.
- Response JSON unparseable: throw `BadGatewayException`.
- Redis read fails: treat as cache miss, continue.

**`ai.controller.ts`**

```
GET  /api/ai/available          → { available: boolean }  (no auth required)
POST /api/ai/enrich             → ApiResponse<AiEnrichedCard[]>
  guard: AccessTokenAuthenticatedGuard
  body: { setId: string }
  delegates to AiService.enrich(setId, req.user.id)
  on BadGatewayException → rethrow (NestJS returns 502 to client)
```

### LLM prompt structure

System message:
```
You are a quiz generator. Given flashcard term-definition pairs, return a JSON object
with a single key "cards" whose value is an array. For each card produce:
- termQuestion: a natural-language question whose answer is the term, based on the definition
- definitionQuestion: a natural-language question whose answer is the definition, based on the term
- termDistractors: array of exactly 3 plausible but incorrect terms
- definitionDistractors: array of exactly 3 plausible but incorrect definitions
Vary the wording so repeated quizzes feel different. Return only valid JSON, no prose.
```

User message: JSON array of `{ id, term, definition }` for every card in the set (HTML stripped).

---

## Frontend

### New service: `apps/front/src/app/shared/http/ai.service.ts`

```typescript
@Injectable({ providedIn: 'root' })
export class AiService {
  constructor(private readonly http: HttpClient) {}

  async available(): Promise<boolean>  // GET /api/ai/available
  async enrich(setId: string): Promise<AiEnrichedCard[] | null>  // POST /api/ai/enrich; returns null on any error
}
```

### `StudySetQuizComponent` changes

- Inject `AiService`
- New property: `aiAvailable = false`, `aiModeSelected = false`, `aiLoading = false`
- In `ngOnInit`: call `aiService.available()`, set `aiAvailable`
- `beginQuiz()` becomes `async`
- When `aiModeSelected`:
  1. Set `aiLoading = true` (disables Start button, shows "Generating…" label)
  2. `const enriched = await aiService.enrich(this.setId)`
  3. Set `aiLoading = false`
  4. Build a lookup map `Map<cardId, AiEnrichedCard>` from the result (or empty map if `null`)
- During question generation, for each card where a lookup entry exists:
  - Replace `card[questionAskWith]` with `enrichedCard.termQuestion` or `enrichedCard.definitionQuestion`
  - For `multipleChoice`: use `enrichedCard.termDistractors` or `enrichedCard.definitionDistractors` as the three wrong options instead of random card picks
  - `written` and `trueOrFalse` question types: only the displayed question text is rephrased; answers and T/F options come from the card unchanged

### Quiz settings UI change (`study-set-quiz.component.html`)

One new row added below the existing three question-type toggles, above the `<hr>`:

```html
<div class="d-flex justify-content-between" *ngIf="aiAvailable">
  <p>AI mode <span class="fs-6 fw-light text-secondary">(rephrases questions & generates distractors)</span></p>
  <input class="form-check-input options-selector" type="checkbox" role="switch"
         name="aiMode" [(ngModel)]="aiModeSelected">
</div>
```

Start button label: `{{ aiLoading ? 'Generating…' : 'Start' }}`, disabled while `aiLoading`.

---

## Error handling summary

| Failure | Behaviour |
|---|---|
| LLM network / 5xx | Controller returns 502; `AiService.enrich()` returns `null`; frontend falls back to local generation |
| LLM returns malformed JSON | Same as above |
| Set not found | 404 from `SetsService`; frontend falls back |
| Set is private and user is not owner | 403 from service; frontend falls back |
| Redis read fails | Treated as cache miss; enrichment proceeds normally |
| Redis write fails | Swallowed; enrichment result still returned |
| `LLM_BASE_URL` not set | `GET /api/ai/available` returns false; AI toggle hidden in UI |
| LLM returns fewer cards than expected | Missing cards use local generation; present cards use AI data |

---

## Files changed / created

### New
- `libs/shared/src/lib/types/api/ai-enriched-card.ts`
- `apps/api/src/app/providers/ai/ai.module.ts`
- `apps/api/src/app/providers/ai/ai.service.ts`
- `apps/api/src/app/providers/ai/ai.controller.ts`
- `apps/front/src/app/shared/http/ai.service.ts`

### Modified
- `libs/shared/src/lib/types/api/index.ts` — add `export * from "./ai-enriched-card"`
- `apps/api/src/app/app.module.ts` — import `AiModule`
- `apps/front/src/app/study-set/study-set-quiz/study-set-quiz.component.ts` — inject `AiService`, async `beginQuiz`, enrichment logic
- `apps/front/src/app/study-set/study-set-quiz/study-set-quiz.component.html` — AI mode toggle, loading state on Start button
- `apps/front/src/app/study-set/study-set.module.ts` — declare nothing new (AiService is `providedIn: 'root'`)
