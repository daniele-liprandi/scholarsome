import { Injectable } from "@angular/core";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { lastValueFrom } from "rxjs";
import { AiEnrichedCard, ApiResponse, ApiResponseOptions } from "@scholarsome/shared";

export const AI_IMAGE_ONLY = "__image_only__" as const;

@Injectable({
  providedIn: "root"
})
export class AiService {
  constructor(private readonly http: HttpClient) {}

  async available(): Promise<boolean> {
    try {
      const response = await lastValueFrom(this.http.get<{ available: boolean }>("/api/ai/available"));
      return response.available;
    } catch (e) {
      return false;
    }
  }

  async enrich(setId: string): Promise<AiEnrichedCard[] | null> {
    let response: ApiResponse<AiEnrichedCard[]> | undefined;

    try {
      response = await lastValueFrom(this.http.post<ApiResponse<AiEnrichedCard[]>>("/api/ai/enrich", {
        setId
      }));
    } catch (e) {
      return null;
    }

    if (response.status === ApiResponseOptions.Success) {
      return response.data;
    }

    return null;
  }

  async explain(cardId: string, setId: string): Promise<string | typeof AI_IMAGE_ONLY | null> {
    let response: ApiResponse<string> | undefined;

    try {
      response = await lastValueFrom(this.http.post<ApiResponse<string>>("/api/ai/explain", {
        cardId,
        setId
      }));
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.status === 422) {
        return AI_IMAGE_ONLY;
      }
      return null;
    }

    if (response.status === ApiResponseOptions.Success) {
      return response.data;
    }

    return null;
  }
}
