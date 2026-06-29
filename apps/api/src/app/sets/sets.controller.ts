import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import { AuthenticatedGuard } from "../auth/guards/authenticated.guard";
import { SetsService } from "./sets.service";
import { UsersService } from "../users/users.service";
import { Request as ExpressRequest } from "express";
import { ApiResponse, ApiResponseOptions } from "@scholarsome/shared";
import { Set } from "@prisma/client";
import * as crypto from "crypto";
import { CardsService } from "../cards/cards.service";
import {
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse
} from "@nestjs/swagger";
import { CreateSetDto } from "./dto/createSet.dto";
import { UpdateSetDto } from "./dto/updateSet.dto";
import { SetIdParam } from "./param/setIdParam.param";
import { UserIdParam } from "../users/param/userId.param";
import { SetsSuccessResponse } from "./response/success/sets.success.response";
import { SetSuccessResponse } from "./response/success/set.success.response";
import { ErrorResponse } from "../shared/response/error.response";
import { AuthService } from "../auth/auth.service";
import { HtmlDecodePipe } from "./pipes/html-decode.pipe";
import { FoldersService } from "../folders/folders.service";
import { PublicSetsQueryDto } from "./dto/publicSetsQuery.dto";
import { PublicSetSetsEntity } from "./response/public-set.sets.entity";
import { PublicSetsSuccessResponse } from "./response/success/public-sets.success.response";

@ApiTags("Sets")
@Controller("sets")
export class SetsController {
  constructor(
    private readonly setsService: SetsService,
    private readonly usersService: UsersService,
    private readonly cardsService: CardsService,
    private readonly authService: AuthService,
    private readonly foldersService: FoldersService
  ) {}

  /**
   * Gets the sets of the authenticated user
   *
   * @returns Array of `Set` objects that belong to the authenticated user
   * @remarks This MUST be placed before the "user/:userId" route to ensure this is mapped
   */
  @ApiOperation({
    summary: "Get the sets of the authenticated user",
    description: "Gets all of the sets of the user that is currently authenticated"
  })
  @ApiOkResponse({
    description: "Expected response to a valid request",
    type: SetsSuccessResponse
  })
  @ApiUnauthorizedResponse({
    description: "Invalid authentication to access the requested resource",
    type: ErrorResponse
  })
  @Get("user/me")
  async mySets(@Request() req: ExpressRequest): Promise<ApiResponse<Set[]>> {
    const user = await this.authService.getUserInfo(req);
    if (!user) throw new UnauthorizedException({ status: "fail", message: "Invalid authentication to access the requested resource" });

    return {
      status: ApiResponseOptions.Success,
      data: await this.setsService.sets({
        where: {
          authorId: user.id
        }
      })
    };
  }

  /**
   * Gets the sets of a user given an author ID
   *
   * @returns Array of `Set` objects that belong to the user
   */
  @ApiOperation({
    summary: "Get the sets of a user"
  })
  @ApiOkResponse({
    description: "Expected response to a valid request",
    type: SetsSuccessResponse
  })
  @ApiNotFoundResponse({
    description: "Resource not found or inaccessible",
    type: ErrorResponse
  })
  @Get("user/:userId")
  async sets(@Request() req: ExpressRequest, @Param() params: UserIdParam): Promise<ApiResponse<Set[]>> {
    const user = await this.authService.getUserInfo(req);

    // if a user is requesting their own sets -> don't filter private sets
    if (user && params.userId === user.id) {
      return {
        status: ApiResponseOptions.Success,
        data: await this.setsService.sets({
          where: {
            authorId: params.userId
          }
        })
      };

    // a user is requesting a different user's sets -> filter private sets
    } else {
      const user = await this.usersService.user({
        id: params.userId
      });
      if (!user) {
        throw new NotFoundException({ status: "fail", message: "User not found" });
      }

      let sets = await this.setsService.sets({
        where: {
          authorId: params.userId
        }
      });

      for (const set of sets) {
        if (set.private) {
          sets = sets.filter((s) => s.id !== set.id);
        }
      }

      return {
        status: ApiResponseOptions.Success,
        data: sets
      };
    }
  }

  @Get("public")
  @UseGuards(AuthenticatedGuard)
  @ApiOperation({ summary: "Get all public sets with search and pagination" })
  @ApiOkResponse({ description: "Expected response to a valid request", type: PublicSetsSuccessResponse })
  @ApiUnauthorizedResponse({ description: "Invalid authentication", type: ErrorResponse })
  async publicSets(@Query() query: PublicSetsQueryDto): Promise<ApiResponse<{
    sets: PublicSetSetsEntity[];
    total: number;
    page: number;
    limit: number;
  }>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const result = await this.setsService.publicSets({
      search: query.search,
      sort: query.sort,
      page,
      limit
    });

    return {
      status: ApiResponseOptions.Success,
      data: { ...result, page, limit }
    };
  }

  /**
   * Gets a set given a set ID
   *
   * @returns `Set` object
   */
  @ApiOperation( {
    summary: "Get a set"
  })
  @ApiOkResponse({
    description: "Expected response to a valid request",
    type: SetSuccessResponse
  })
  @ApiNotFoundResponse({
    description: "Resource not found or inaccessible",
    type: ErrorResponse
  })
  @ApiUnauthorizedResponse({
    description: "Invalid authentication to access the requested resource",
    type: ErrorResponse
  })
  @Get(":setId")
  async set(@Param() params: SetIdParam, @Request() req: ExpressRequest): Promise<ApiResponse<Set>> {
    const set = await this.setsService.set({
      id: params.setId
    });
    if (!set) throw new NotFoundException({ status: "fail", message: "Set not found" });

    if (set.private) {
      const userCookie = await this.authService.getUserInfo(req);

      if (!userCookie) throw new UnauthorizedException({ status: "fail", message: "Invalid authentication to access the requested resource" });
      if (set.authorId !== userCookie.id) throw new UnauthorizedException({ status: "fail", message: "Invalid authentication to access the requested resource" });
    }

    return {
      status: ApiResponseOptions.Success,
      data: set
    };
  }

  /**
   * Creates a set
   *
   * @returns Created `Set` object
   */
  @ApiOperation( {
    summary: "Create a set"
  })
  @ApiCreatedResponse({
    description: "Expected response to a valid request",
    type: SetSuccessResponse
  })
  @ApiUnauthorizedResponse({
    description: "Invalid authentication to access the requested resource",
    type: ErrorResponse
  })
  @UseGuards(AuthenticatedGuard)
  @Post()
  async createSet(@Body(HtmlDecodePipe) body: CreateSetDto, @Request() req: ExpressRequest): Promise<ApiResponse<Set>> {
    const user = await this.authService.getUserInfo(req);
    if (!user) throw new UnauthorizedException({ status: "fail", message: "Invalid authentication to access the requested resource" });

    const author = await this.usersService.user({
      email: user.email
    });
    if (!author) throw new UnauthorizedException({ status: "fail", message: "Invalid authentication to access the requested resource" });

    const uuid = crypto.randomUUID();
    const media: string[] = [];

    for (const [i, card] of body.cards.entries()) {
      const scannedTerm = await this.cardsService.scanAndUploadMedia(card.term, uuid);
      if (scannedTerm) {
        body.cards[i].term = scannedTerm.scanned;
        media.push(...scannedTerm.media);
      }

      const scannedDefinition = await this.cardsService.scanAndUploadMedia(card.definition, uuid);
      if (scannedDefinition) {
        body.cards[i].definition = scannedDefinition.scanned;
        media.push(...scannedDefinition.media);
      }
    }

    if (body.folders) {
      for (const folderId of body.folders) {
        const folder = await this.foldersService.folder({ id: folderId });
        if (!folder) {
          throw new UnauthorizedException({
            status: "fail",
            message: `Folder with ID ${folderId} does not exist`
          });
        }

        if (folder.authorId !== user.id) {
          throw new UnauthorizedException({
            status: "fail",
            message: `User is not author of folder with id ${folderId}`
          });
        }
      }
    }

    const create = await this.setsService.createSet({
      id: uuid,
      author: {
        connect: {
          email: author.email
        }
      },
      title: body.title,
      description: body.description,
      private: body.private,
      folders: {
        connect: body.folders ? body.folders.map((f) => {
          return { id: f };
        }) : undefined
      },
      cards: {
        createMany: {
          data: body.cards.map((c) => {
            return {
              index: c.index,
              term: c.term,
              definition: c.definition
            };
          })
        }
      }
    });

    for (const file of media) {
      const card = create.cards.find((c) => c.term.includes(file) || c.definition.includes(file));
      if (!card) continue;

      await this.cardsService.createCardMedia({
        card: {
          connect: {
            id: card.id
          }
        },
        name: file
      });
    }

    return {
      status: ApiResponseOptions.Success,
      data: create
    };
  }

  /**
   * Updates a set
   *
   * @returns Updated `Set` object
   */
  @ApiOperation( {
    summary: "Update a set"
  })
  @ApiOkResponse({
    description: "Expected response to a valid request",
    type: SetSuccessResponse
  })
  @ApiNotFoundResponse({
    description: "Resource not found or inaccessible",
    type: ErrorResponse
  })
  @ApiUnauthorizedResponse({
    description: "Invalid authentication to access the requested resource",
    type: ErrorResponse
  })
  @UseGuards(AuthenticatedGuard)
  @Patch(":setId")
  async updateSet(@Param() params: SetIdParam, @Body(HtmlDecodePipe) body: UpdateSetDto, @Request() req: ExpressRequest): Promise<ApiResponse<Set>> {
    const user = await this.authService.getUserInfo(req);
    if (!user) throw new UnauthorizedException({ status: "fail", message: "Invalid authentication to access the requested resource" });

    const set = await this.setsService.set({
      id: params.setId
    });
    if (!set) throw new NotFoundException({ status: "fail", message: "Set not found" });

    if (!(await this.setsService.verifySetOwnership(req, params.setId))) throw new UnauthorizedException({ status: "fail", message: "Invalid authentication to access the requested resource" });

    let newFolderIDs: string[] = [];
    let removedFolderIDs: string[] = [];

    if (body.folders) {
      const currentFolderIDs = set.folders.map((f) => f.id);

      newFolderIDs = body.folders.filter((id) => !currentFolderIDs.includes(id));
      removedFolderIDs = currentFolderIDs.filter((id) => !body.folders.includes(id));
    }

    for (const folderId of newFolderIDs) {
      const folder = await this.foldersService.folder({ id: folderId });
      if (!folder) {
        throw new UnauthorizedException({
          status: "fail",
          message: `Folder with ID ${folderId} does not exist`
        });
      }

      if (folder.authorId !== user.id) {
        throw new UnauthorizedException({
          status: "fail",
          message: `User is not author of folder with id ${folderId}`
        });
      }
    }

    const newMediaEntries: { name: string; cardId: string }[] = [];

    if (body.cards) {
      const existingCards = await this.cardsService.cards({ where: { setId: set.id } });
      const existingCardIds = new Set(existingCards.map((c) => c.id));
      const bodyCardIds = new Set(body.cards.filter((c) => c.id).map((c) => c.id as string));

      // Cards present in DB but absent from the request body → delete
      const cardIdsToDelete = existingCards
          .filter((c) => !bodyCardIds.has(c.id))
          .map((c) => c.id);

      for (const cardId of cardIdsToDelete) {
        const card = existingCards.find((c) => c.id === cardId);
        if (card?.media) {
          for (const mediaFile of card.media) {
            await this.cardsService.deleteMedia(set.id, mediaFile.name);
          }
        }
        await this.cardsService.deleteCard({ id: cardId });
      }

      // Cards present in body with a known ID → update in-place (FSRS state survives)
      const cardsToUpdate = body.cards.filter((c) => c.id && existingCardIds.has(c.id));

      for (const card of cardsToUpdate) {
        const completeCard = await this.cardsService.card({ id: card.id });
        if (completeCard) {
          for (const mediaFile of completeCard.media) {
            if (!card.term.includes(mediaFile.name) && !card.definition.includes(mediaFile.name)) {
              await this.cardsService.deleteCardMedia({ id: mediaFile.id });
              await this.cardsService.deleteMedia(set.id, mediaFile.name);
            }
          }
        }

        let termContent = card.term;
        let defContent = card.definition;

        const scannedTerm = await this.cardsService.scanAndUploadMedia(card.term, set.id);
        if (scannedTerm) {
          termContent = scannedTerm.scanned;
          newMediaEntries.push(...scannedTerm.media.map((n) => ({ name: n, cardId: card.id as string })));
        }

        const scannedDef = await this.cardsService.scanAndUploadMedia(card.definition, set.id);
        if (scannedDef) {
          defContent = scannedDef.scanned;
          newMediaEntries.push(...scannedDef.media.map((n) => ({ name: n, cardId: card.id as string })));
        }

        await this.cardsService.updateCard({
          where: { id: card.id as string },
          data: { index: card.index, term: termContent, definition: defContent }
        });
      }

      // Cards present in body without an ID → create new
      const cardsToCreate = body.cards.filter((c) => !c.id || !existingCardIds.has(c.id));

      for (const card of cardsToCreate) {
        let termContent = card.term;
        let defContent = card.definition;

        const scannedTerm = await this.cardsService.scanAndUploadMedia(card.term, set.id);
        if (scannedTerm) {
          termContent = scannedTerm.scanned;
        }

        const scannedDef = await this.cardsService.scanAndUploadMedia(card.definition, set.id);
        if (scannedDef) {
          defContent = scannedDef.scanned;
        }

        const created = await this.cardsService.createCard({
          index: card.index,
          term: termContent,
          definition: defContent,
          set: { connect: { id: set.id } }
        });

        if (scannedTerm) {
          newMediaEntries.push(...scannedTerm.media.map((n) => ({ name: n, cardId: created.id })));
        }
        if (scannedDef) {
          newMediaEntries.push(...scannedDef.media.map((n) => ({ name: n, cardId: created.id })));
        }
      }
    }

    const update = await this.setsService.updateSet({
      where: { id: set.id },
      data: {
        title: body.title,
        description: body.description,
        private: body.private,
        folders: {
          connect: newFolderIDs.map((s) => ({ id: s })),
          disconnect: removedFolderIDs.map((s) => ({ id: s }))
        }
      }
    });

    for (const entry of newMediaEntries) {
      await this.cardsService.createCardMedia({
        card: { connect: { id: entry.cardId } },
        name: entry.name
      });
    }

    return {
      status: ApiResponseOptions.Success,
      data: update
    };
  }

  /**
   * Deletes a set
   *
   * @returns Deleted `Set` Object
   */
  @ApiOperation( {
    summary: "Delete a set"
  })
  @ApiOkResponse({
    description: "Expected response to a valid request",
    type: SetSuccessResponse
  })
  @ApiUnauthorizedResponse({
    description: "Invalid authentication to access the requested resource",
    type: ErrorResponse
  })
  @UseGuards(AuthenticatedGuard)
  @Delete(":setId")
  async deleteSet(@Param() params: SetIdParam, @Request() req: ExpressRequest): Promise<ApiResponse<Set>> {
    if (!(await this.setsService.verifySetOwnership(req, params.setId))) throw new UnauthorizedException({ status: "fail", message: "Invalid authentication to access the requested resource" });

    const set = await this.setsService.deleteSet({
      id: params.setId
    });

    await this.setsService.deleteSetMediaFiles(params.setId);

    return {
      status: ApiResponseOptions.Success,
      data: set
    };
  }
}
