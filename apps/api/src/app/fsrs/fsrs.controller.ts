import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import { Request as ExpressRequest } from "express";
import { FsrsService } from "./fsrs.service";
import { AuthService } from "../auth/auth.service";
import { AuthenticatedGuard } from "../auth/guards/authenticated.guard";
import { CardFsrsStateResponse, FsrsRating, FsrsReviewCard, FsrsSetSummary } from "@scholarsome/shared";

@Controller()
export class FsrsController {
  constructor(
    private readonly fsrsService: FsrsService,
    private readonly authService: AuthService
  ) {}

  @Get("sets/:setId/fsrs")
  @UseGuards(AuthenticatedGuard)
  async getStatesForSet(
    @Param("setId") setId: string,
    @Request() req: ExpressRequest
  ): Promise<CardFsrsStateResponse[]> {
    const user = await this.authService.getUserInfo(req);
    if (!user) throw new UnauthorizedException();
    return this.fsrsService.getStatesForSet(setId, user.id);
  }

  @Post("sets/cards/:cardId/fsrs/review")
  @UseGuards(AuthenticatedGuard)
  async submitReview(
    @Param("cardId") cardId: string,
    @Request() req: ExpressRequest,
    @Body() body: { rating: FsrsRating; durationMs?: number }
  ): Promise<CardFsrsStateResponse> {
    const user = await this.authService.getUserInfo(req);
    if (!user) throw new UnauthorizedException();
    return this.fsrsService.submitReview(cardId, user.id, body.rating, body.durationMs);
  }

  @Get("fsrs/user/summary")
  @UseGuards(AuthenticatedGuard)
  async getUserSummary(@Request() req: ExpressRequest): Promise<FsrsSetSummary[]> {
    const user = await this.authService.getUserInfo(req);
    if (!user) throw new UnauthorizedException();
    return this.fsrsService.getUserSetSummaries(user.id);
  }

  @Get("fsrs/user/review-queue")
  @UseGuards(AuthenticatedGuard)
  async getReviewQueue(@Request() req: ExpressRequest): Promise<FsrsReviewCard[]> {
    const user = await this.authService.getUserInfo(req);
    if (!user) throw new UnauthorizedException();
    return this.fsrsService.getOverdueQueue(user.id);
  }
}
