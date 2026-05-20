import { HttpService } from "@nestjs/axios";
import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRedis } from "@liaoliaots/nestjs-redis";
import { AiEnrichedCard } from "@scholarsome/shared";
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

    const sanitizedCards = set.cards.map((card) => ({
      id: card.id,
      term: this.stripHtml(card.term),
      definition: this.stripHtml(card.definition)
    }));

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
      const llmResponse = await lastValueFrom(this.httpService.post(
        `${this.baseUrl}/v1/chat/completions`,
        {
          model: this.configService.get<string>("LLM_MODEL"),
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: "You are a quiz generator. Given flashcard term-definition pairs, return a JSON object with a single key \"cards\" whose value is an array. For each card produce: termQuestion: a natural-language question whose answer is the term, based on the definition; definitionQuestion: a natural-language question whose answer is the definition, based on the term; termDistractors: array of exactly 3 plausible but incorrect terms; definitionDistractors: array of exactly 3 plausible but incorrect definitions. Keep each card aligned to its input card id by including cardId in each output item. Vary the wording so repeated quizzes feel different. Return only valid JSON, no prose."
            },
            {
              role: "user",
              content: JSON.stringify(cards)
            }
          ]
        },
        {
          headers: {
            Authorization: `Bearer ${this.configService.get<string>("LLM_AUTH_TOKEN")}`
          }
        }
      ));

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

          return {
            cardId,
            termQuestion: card.termQuestion,
            definitionQuestion: card.definitionQuestion,
            termDistractors,
            definitionDistractors
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

  private stripHtml(text: string): string {
    return text.replace(/<[^>]+>/g, "").trim();
  }
}
