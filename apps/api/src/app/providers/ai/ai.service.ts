import { HttpService } from "@nestjs/axios";
import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnprocessableEntityException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRedis } from "@liaoliaots/nestjs-redis";
import { AiEnrichedCard } from "@scholarsome/shared";
import { extractTextContent } from "./extract-text-content";
import Redis from "ioredis";
import { lastValueFrom } from "rxjs";
import { SetsService } from "../../sets/sets.service";

interface SetCardInput {
  id: string;
  term: string;
  definition: string;
}

interface LlmCardOutput {
  cardId?: string;
  termQuestion: unknown;
  definitionQuestion: unknown;
  termDistractors: unknown;
  definitionDistractors: unknown;
  termTrueFalseStatements?: unknown;
  definitionTrueFalseStatements?: unknown;
}

@Injectable()
export class AiService implements OnModuleInit {
  private available = false;
  private baseUrl: string | null = null;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @InjectRedis() private readonly redis: Redis,
    private readonly setsService: SetsService
  ) {}

  onModuleInit(): void {
    const baseUrl = this.configService.get<string>("LLM_BASE_URL");

    if (!baseUrl) {
      this.available = false;
      this.baseUrl = null;
      return;
    }

    this.available = true;
    this.baseUrl = baseUrl;
  }

  isAvailable(): boolean {
    return this.available;
  }

  async explain(cardId: string, setId: string, requestingUserId: string): Promise<string> {
    if (!this.available || !this.baseUrl) {
      throw new BadGatewayException("AI enrichment is unavailable");
    }

    const cacheKey = `ai:explain:${cardId}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return cached;
    } catch (e) {
      // Redis read failures are treated as cache misses.
    }

    const set = await this.setsService.set({ id: setId });
    if (!set) throw new NotFoundException("Set not found");

    if (set.private && set.authorId !== requestingUserId) {
      throw new ForbiddenException("Set is private");
    }

    const card = set.cards.find((c: { id: string }) => c.id === cardId);
    if (!card) throw new NotFoundException("Card not found");

    const term = extractTextContent((card as { term: string }).term);
    const definition = extractTextContent((card as { definition: string }).definition);

    if (!term && !definition) {
      throw new UnprocessableEntityException("IMAGE_ONLY");
    }

    let wikipediaContext = "";
    try {
      const wikiResponse = await lastValueFrom(
          this.httpService.get<{ extract?: string }>(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`, {
            headers: { "User-Agent": "Scholarsome/1.0 (educational flashcard app)" }
          })
      );
      if (wikiResponse.data?.extract) {
        wikipediaContext = `\n\nWikipedia summary for "${term}": ${wikiResponse.data.extract}`;
      }
    } catch (e) {
      // Wikipedia fetch failures are non-fatal; proceed without context.
    }

    const explanation = await this.requestExplanation(term, definition, wikipediaContext);

    try {
      await this.redis.set(cacheKey, explanation, "EX", 86400);
    } catch (e) {
      // Cache write failures should not fail the request.
    }

    return explanation;
  }

  private async requestExplanation(term: string, definition: string, wikipediaContext: string): Promise<string> {
    try {
      const requestBody = {
        model: this.configService.get<string>("LLM_MODEL"),
        messages: [
          {
            role: "system",
            content: "You are an educational assistant. Given a flashcard term and its definition, explain the concept clearly and concisely in 2-4 sentences, as if teaching a student. Use plain language. If Wikipedia context is provided, use it to enrich your explanation but do not copy it verbatim. Return only the explanation text, no headings or bullet points."
          },
          {
            role: "user",
            content: `Term: ${term}\nDefinition: ${definition}${wikipediaContext}`
          }
        ]
      };

      const response = await lastValueFrom(this.httpService.post(`${this.baseUrl}/v1/chat/completions`, requestBody, {
        headers: { Authorization: `Bearer ${this.configService.get<string>("LLM_AUTH_TOKEN")}` }
      }));

      const content = response?.data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new BadGatewayException("Invalid AI response payload");
      }

      return content.trim();
    } catch (e) {
      if (e instanceof BadGatewayException) throw e;
      throw new BadGatewayException("Failed to generate explanation");
    }
  }

  async enrich(setId: string, requestingUserId: string): Promise<AiEnrichedCard[]> {
    if (!this.available || !this.baseUrl) {
      throw new BadGatewayException("AI enrichment is unavailable");
    }

    const cacheKey = `ai:${setId}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as AiEnrichedCard[];
      }
    } catch (e) {
      // Redis read failures are treated as cache misses.
    }

    const set = await this.setsService.set({ id: setId });
    if (!set) throw new NotFoundException("Set not found");

    if (set.private && set.authorId !== requestingUserId) {
      throw new ForbiddenException("Set is private");
    }

    const sanitizedCards = set.cards
        .map((card: { id: string; term: string; definition: string }) => ({
          id: card.id,
          term: extractTextContent(card.term),
          definition: extractTextContent(card.definition)
        }))
        .filter((card) => card.term || card.definition);

    const llmCards = await this.requestLlmCards(sanitizedCards);
    const enriched = this.validateEnrichedCards(llmCards, sanitizedCards);

    try {
      await this.redis.set(cacheKey, JSON.stringify(enriched), "EX", 86400);
    } catch (e) {
      // Cache write failures should not fail enrichment.
    }

    return enriched;
  }

  private async requestLlmCards(cards: SetCardInput[]): Promise<LlmCardOutput[]> {
    const response = await this.callLlm(cards);

    const content = response?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new BadGatewayException("Invalid AI response payload");
    }

    let parsed: { cards?: unknown };

    try {
      parsed = JSON.parse(content) as { cards?: unknown };
    } catch (e) {
      throw new BadGatewayException("Invalid AI response payload");
    }

    if (!Array.isArray(parsed.cards)) {
      return [];
    }

    return parsed.cards as LlmCardOutput[];
  }

  private async callLlm(cards: SetCardInput[]): Promise<{ choices?: { message?: { content?: string } }[] }> {
    try {
      const requestBody = {
        model: this.configService.get<string>("LLM_MODEL"),
        messages: [
          {
            role: "system",
            content: "You are a quiz generator. Given flashcard term-definition pairs, return a JSON object with a single key \"cards\" whose value is an array. For each card produce: termQuestion: a natural-language question whose answer is the term, based on the definition; definitionQuestion: a natural-language question whose answer is the definition, based on the term; termDistractors: array of exactly 3 plausible but incorrect terms; definitionDistractors: array of exactly 3 plausible but incorrect definitions. Optionally include termTrueFalseStatements and definitionTrueFalseStatements with this shape: { trueStatement: string, falseStatement: string }. Keep each card aligned to its input card id by including cardId in each output item. Vary the wording so repeated quizzes feel different. Return only valid JSON, no prose."
          },
          {
            role: "user",
            content: JSON.stringify(cards)
          }
        ]
      };

      (requestBody as { response_format?: { type: string } })["response_format"] = { type: "json_object" };

      const llmResponse = await lastValueFrom(this.httpService.post(`${this.baseUrl}/v1/chat/completions`, requestBody, {
        headers: {
          Authorization: `Bearer ${this.configService.get<string>("LLM_AUTH_TOKEN")}`
        }
      }));

      return llmResponse.data as { choices?: { message?: { content?: string } }[] };
    } catch (e) {
      throw new BadGatewayException("Failed to enrich quiz data");
    }
  }

  private validateEnrichedCards(llmCards: LlmCardOutput[], sourceCards: SetCardInput[]): AiEnrichedCard[] {
    const sourceById = new Map(sourceCards.map((card) => [card.id, card]));

    return llmCards
        .map((card, index) => {
          const fallbackSource = sourceCards[index];
          const cardId = typeof card.cardId === "string" && sourceById.has(card.cardId) ? card.cardId : fallbackSource?.id;

          if (!cardId) return null;
          if (typeof card.termQuestion !== "string" || typeof card.definitionQuestion !== "string") return null;

          const termDistractors = this.getDistractors(card.termDistractors);
          const definitionDistractors = this.getDistractors(card.definitionDistractors);
          if (!termDistractors || !definitionDistractors) return null;

          const termTrueFalseStatements = this.getTrueFalseStatements(card.termTrueFalseStatements);
          const definitionTrueFalseStatements = this.getTrueFalseStatements(card.definitionTrueFalseStatements);

          return {
            cardId,
            termQuestion: card.termQuestion,
            definitionQuestion: card.definitionQuestion,
            termDistractors,
            definitionDistractors,
            ...(termTrueFalseStatements ? { termTrueFalseStatements } : {}),
            ...(definitionTrueFalseStatements ? { definitionTrueFalseStatements } : {})
          };
        })
        .filter((card): card is AiEnrichedCard => card !== null);
  }

  private getDistractors(value: unknown): string[] | null {
    if (!Array.isArray(value)) return null;
    if (value.length !== 3) return null;
    if (!value.every((item) => typeof item === "string")) return null;

    return value as string[];
  }

  private getTrueFalseStatements(value: unknown): AiEnrichedCard["termTrueFalseStatements"] | null {
    if (!value || typeof value !== "object") return null;

    const statements = value as { trueStatement?: unknown; falseStatement?: unknown };

    if (typeof statements.trueStatement !== "string" || typeof statements.falseStatement !== "string") {
      return null;
    }

    if (!statements.trueStatement.trim() || !statements.falseStatement.trim()) {
      return null;
    }

    return {
      trueStatement: statements.trueStatement,
      falseStatement: statements.falseStatement
    };
  }
}
