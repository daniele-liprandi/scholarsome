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
