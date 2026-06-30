import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../providers/database/prisma/prisma.service";
import { createEmptyCard, fsrs, generatorParameters, Grade } from "ts-fsrs";
import { CardFsrsStateResponse, FsrsReviewCard, FsrsSetSummary } from "@scholarsome/shared";

@Injectable()
export class FsrsService {
  private readonly f = fsrs(generatorParameters());

  constructor(private readonly prisma: PrismaService) {}

  async getStatesForSet(setId: string, userId: string): Promise<CardFsrsStateResponse[]> {
    const set = await this.prisma.set.findUnique({
      where: { id: setId },
      include: { cards: { select: { id: true } } }
    });

    if (!set) throw new NotFoundException();

    const existingStates = await this.prisma.cardFsrsState.findMany({
      where: { userId, cardId: { in: set.cards.map((c) => c.id) } }
    });

    const stateByCardId = new Map(existingStates.map((s) => [s.cardId, s]));

    return set.cards.map((card) => {
      const s = stateByCardId.get(card.id);
      if (!s) {
        return {
          cardId: card.id,
          due: new Date().toISOString(),
          stability: 0,
          difficulty: 0,
          reps: 0,
          lapses: 0,
          state: 0 as const,
          lastReview: null,
          avgReviewDurationMs: null
        };
      }

      return {
        cardId: s.cardId,
        due: s.due.toISOString(),
        stability: s.stability,
        difficulty: s.difficulty,
        reps: s.reps,
        lapses: s.lapses,
        state: s.state as 0 | 1 | 2 | 3,
        lastReview: s.lastReview ? s.lastReview.toISOString() : null,
        avgReviewDurationMs: s.avgReviewDurationMs ?? null
      };
    });
  }

  async getUserSetSummaries(userId: string): Promise<FsrsSetSummary[]> {
    const sets = await this.prisma.set.findMany({
      where: { authorId: userId },
      include: { cards: { select: { id: true } } }
    });

    if (sets.length === 0) return [];

    const allCardIds = sets.flatMap((s) => s.cards.map((c) => c.id));
    const states = await this.prisma.cardFsrsState.findMany({
      where: { userId, cardId: { in: allCardIds } }
    });
    const stateByCardId = new Map(states.map((s) => [s.cardId, s]));

    const now = new Date();
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    return sets.map((set) => {
      let newCount = 0;
      let dueTodayCount = 0;
      let overdueCount = 0;

      for (const card of set.cards) {
        const s = stateByCardId.get(card.id);
        if (!s || s.state === 0) {
          newCount++;
        } else {
          const due = new Date(s.due);
          if (due <= now) {
            overdueCount++;
          } else if (due <= endOfToday) {
            dueTodayCount++;
          }
        }
      }

      return { setId: set.id, newCount, dueTodayCount, overdueCount };
    });
  }

  async getOverdueQueue(userId: string): Promise<FsrsReviewCard[]> {
    const now = new Date();

    const states = await this.prisma.cardFsrsState.findMany({
      where: {
        userId,
        state: { not: 0 },
        due: { lte: now }
      },
      include: {
        card: {
          include: {
            set: { select: { id: true, title: true } }
          }
        }
      },
      orderBy: { due: "asc" },
      take: 50
    });

    return states.map((s) => ({
      cardId: s.cardId,
      setId: s.card.set.id,
      setTitle: s.card.set.title,
      term: s.card.term,
      definition: s.card.definition,
      due: s.due.toISOString(),
      state: s.state as 0 | 1 | 2 | 3,
      lapses: s.lapses
    }));
  }

  async submitReview(
      cardId: string,
      userId: string,
      rating: 1 | 2 | 3 | 4,
      durationMs?: number
  ): Promise<CardFsrsStateResponse> {
    const card = await this.prisma.card.findUnique({ where: { id: cardId } });
    if (!card) throw new NotFoundException();

    // eslint-disable-next-line camelcase
    const existing = await this.prisma.cardFsrsState.findUnique({
      // eslint-disable-next-line camelcase
      where: { userId_cardId: { userId, cardId } }
    });

    const now = new Date();

    /* eslint-disable camelcase */
    const fsrsCard = existing ?
      {
        due: existing.due,
        stability: existing.stability,
        difficulty: existing.difficulty,
        elapsed_days: existing.elapsedDays,
        scheduled_days: existing.scheduledDays,
        reps: existing.reps,
        lapses: existing.lapses,
        learning_steps: existing.learningSteps,
        state: existing.state as 0 | 1 | 2 | 3,
        last_review: existing.lastReview ?? now
      } :
      createEmptyCard(now);

    const result = this.f.next(fsrsCard, now, rating as Grade);
    const next = result.card;

    const newAvgDuration: number | null =
      durationMs && durationMs > 0 ?
        FsrsService.computeAvgDuration(existing?.avgReviewDurationMs ?? null, durationMs, next.reps) :
        (existing?.avgReviewDurationMs ?? null);

    const updated = await this.prisma.cardFsrsState.upsert({
      // eslint-disable-next-line camelcase
      where: { userId_cardId: { userId, cardId } },
      create: {
        userId,
        cardId,
        due: next.due,
        stability: next.stability,
        difficulty: next.difficulty,
        elapsedDays: next.elapsed_days,
        scheduledDays: next.scheduled_days,
        reps: next.reps,
        lapses: next.lapses,
        learningSteps: next.learning_steps,
        state: next.state,
        lastReview: next.last_review,
        avgReviewDurationMs: newAvgDuration
      },
      update: {
        due: next.due,
        stability: next.stability,
        difficulty: next.difficulty,
        elapsedDays: next.elapsed_days,
        scheduledDays: next.scheduled_days,
        reps: next.reps,
        lapses: next.lapses,
        learningSteps: next.learning_steps,
        state: next.state,
        lastReview: next.last_review,
        avgReviewDurationMs: newAvgDuration
      }
    });
    /* eslint-enable camelcase */

    return {
      cardId: updated.cardId,
      due: updated.due.toISOString(),
      stability: updated.stability,
      difficulty: updated.difficulty,
      reps: updated.reps,
      lapses: updated.lapses,
      state: updated.state as 0 | 1 | 2 | 3,
      lastReview: updated.lastReview ? updated.lastReview.toISOString() : null,
      avgReviewDurationMs: updated.avgReviewDurationMs ?? null
    };
  }

  static computeAvgDuration(prevAvg: number | null, durationMs: number, newReps: number): number {
    if (prevAvg === null || newReps <= 1) return durationMs;
    return Math.round((prevAvg * (newReps - 1) + durationMs) / newReps);
  }
}
