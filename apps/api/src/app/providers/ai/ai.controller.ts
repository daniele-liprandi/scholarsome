import { Body, Controller, Get, Post, Request, UseGuards, BadRequestException } from "@nestjs/common";
import { AccessTokenAuthenticatedGuard } from "../../auth/guards/accessTokenAuthenticated.guard";
import { TokenUser } from "../../auth/types/token-user.interface";
import { AiEnrichedCard, ApiResponse, ApiResponseOptions } from "@scholarsome/shared";
import { Request as ExpressRequest } from "express";
import { AiService } from "./ai.service";

@Controller("ai")
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get("available")
  available(): { available: boolean } {
    return { available: this.aiService.isAvailable() };
  }

  @UseGuards(AccessTokenAuthenticatedGuard)
  @Post("enrich")
  async enrich(
    @Body() body: { setId: string },
    @Request() req: ExpressRequest & { user: TokenUser }
  ): Promise<ApiResponse<AiEnrichedCard[]>> {
    return {
      status: ApiResponseOptions.Success,
      data: await this.aiService.enrich(body.setId, req.user.id)
    };
  }

  @UseGuards(AccessTokenAuthenticatedGuard)
  @Post("explain")
  async explain(
    @Body() body: { cardId: string; setId: string },
    @Request() req: ExpressRequest & { user: TokenUser }
  ): Promise<ApiResponse<string>> {
    if (!body.cardId || !body.setId) {
      throw new BadRequestException("cardId and setId are required");
    }
    return {
      status: ApiResponseOptions.Success,
      data: await this.aiService.explain(body.cardId, body.setId, req.user.id)
    };
  }
}
