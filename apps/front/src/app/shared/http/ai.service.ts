import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { lastValueFrom } from "rxjs";
import { AiEnrichedCard, ApiResponse, ApiResponseOptions } from "@scholarsome/shared";

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
}
