import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { lastValueFrom } from "rxjs";
import { CardFsrsStateResponse, FsrsRating, FsrsReviewCard, FsrsSetSummary } from "@scholarsome/shared";

@Injectable({
  providedIn: "root"
})
export class FsrsService {
  constructor(private readonly http: HttpClient) {}

  async getStatesForSet(setId: string): Promise<CardFsrsStateResponse[] | null> {
    try {
      return await lastValueFrom(
          this.http.get<CardFsrsStateResponse[]>(`/api/sets/${setId}/fsrs`)
      );
    } catch {
      return null;
    }
  }

  async submitReview(cardId: string, rating: FsrsRating, durationMs?: number): Promise<CardFsrsStateResponse | null> {
    try {
      return await lastValueFrom(
          this.http.post<CardFsrsStateResponse>(`/api/sets/cards/${cardId}/fsrs/review`, { rating, durationMs })
      );
    } catch {
      return null;
    }
  }

  async getUserSetSummaries(): Promise<FsrsSetSummary[] | null> {
    try {
      return await lastValueFrom(this.http.get<FsrsSetSummary[]>("/api/fsrs/user/summary"));
    } catch {
      return null;
    }
  }

  async getReviewQueue(): Promise<FsrsReviewCard[] | null> {
    try {
      return await lastValueFrom(this.http.get<FsrsReviewCard[]>("/api/fsrs/user/review-queue"));
    } catch {
      return null;
    }
  }
}
