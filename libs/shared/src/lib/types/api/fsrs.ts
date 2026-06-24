export interface CardFsrsStateResponse {
  cardId: string;
  due: string;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  state: 0 | 1 | 2 | 3;
  lastReview: string | null;
}

export interface FsrsSetSummary {
  setId: string;
  newCount: number;
  dueTodayCount: number;
  overdueCount: number;
}

export interface FsrsReviewCard {
  cardId: string;
  setId: string;
  setTitle: string;
  term: string;
  definition: string;
  due: string;
  state: 0 | 1 | 2 | 3;
  lapses: number;
}
