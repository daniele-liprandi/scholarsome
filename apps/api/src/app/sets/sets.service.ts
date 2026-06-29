import { Injectable } from "@nestjs/common";
import { PrismaService } from "../providers/database/prisma/prisma.service";
import { Prisma } from "@prisma/client";
import { Set } from "@scholarsome/shared";
import { Request as ExpressRequest } from "express";
import jwt_decode from "jwt-decode";
import { UsersService } from "../users/users.service";
import { StorageService } from "../providers/storage/storage.service";

@Injectable()
export class SetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly storageService: StorageService
  ) {}

  /**
   * Removes set media files from S3 or local storage
   *
   * @param setId ID of the set to delete media from
   */
  async deleteSetMediaFiles(setId: string): Promise<void> {
    return await this.storageService.getInstance().deleteDirectoryFiles("media/sets/" + setId);
  }

  /**
   * Verifies whether a set belongs to a user given their access token cookie
   *
   * @param req Request object of the user
   * @param setId ID of the set to check against
   *
   * @returns Whether the set belongs to the user
   */
  public async verifySetOwnership(req: ExpressRequest, setId: string): Promise<boolean> {
    let accessToken: { id: string; email: string; };

    if (req.cookies && req.cookies["access_token"]) {
      accessToken = jwt_decode(req.cookies["access_token"]) as { id: string; email: string; };
    } else {
      return false;
    }

    const user = await this.usersService.user({
      id: accessToken.id
    });

    const set = await this.set({
      id: setId
    });

    if (!set || !user) return false;

    return set.author.id === user.id;
  }

  /**
   * Shifts the index of all cards in a set with an index greater than or equal to startIndex a specified amount
   *
   * @param setId ID of the set
   * @param startIndex The index to start the shift at
   * @param shiftAmount The amount to shift each index
   *
   * @returns Void
   */
  public async shiftCardIndices(
      setId: string,
      startIndex: number,
      shiftAmount: number
  ): Promise<void> {
    const cardsToUpdate = await this.prisma.card.findMany({
      where: {
        index: { gte: startIndex },
        setId: setId
      }
    });

    const updates = cardsToUpdate.map((card) => {
      return this.prisma.card.update({
        where: { id: card.id },
        data: { index: card.index + shiftAmount }
      });
    });

    await Promise.all(updates);
  }

  /**
   * Queries the database for every public set's ID and when they were last modified
   * Used for sitemap generation
   *
   * @returns Array of all set IDs and when they were last updated
   */
  async getSitemapSetInfo(): Promise<{ id: string, updatedAt: Date }[]> {
    return this.prisma.set.findMany({
      where: {
        private: false
      },
      select: {
        id: true,
        updatedAt: true
      }
    });
  }

  async publicSets(params: {
    search?: string;
    sort?: "newest" | "oldest" | "most_cards";
    page?: number;
    limit?: number;
  }): Promise<{
    sets: {
      id: string;
      title: string;
      description: string | null;
      author: { id: string; username: string };
      cardCount: number;
      createdAt: Date;
      updatedAt: Date;
    }[];
    total: number;
  }> {
    const { search = "", sort = "newest", page = 1, limit = 20 } = params;

    const where: Prisma.SetWhereInput = {
      private: false,
      ...(search ? {
        OR: [
          { title: { contains: search } },
          { author: { username: { contains: search } } }
        ]
      } : {})
    };

    const total = await this.prisma.set.count({ where });

    const orderBy: Prisma.SetOrderByWithRelationInput =
      sort === "oldest" ? { createdAt: "asc" } :
      sort === "most_cards" ? { cards: { _count: "desc" } } :
      { createdAt: "desc" };

    const sets = await this.prisma.set.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy,
      include: {
        author: { select: { id: true, username: true } },
        _count: { select: { cards: true } }
      }
    });

    return {
      sets: sets.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description ?? null,
        author: s.author,
        cardCount: s._count.cards,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      })),
      total
    };
  }

  /**
   * Queries the database for a unique set
   *
   * @param setWhereUniqueInput Prisma `SetWhereUniqueInput` selector
   *
   * @returns Queried `Set` object
   */
  async set(
      setWhereUniqueInput: Prisma.SetWhereUniqueInput
  ): Promise<Set | null> {
    return this.prisma.set.findUnique({
      where: setWhereUniqueInput,
      include: {
        cards: true,
        folders: true,
        author: {
          select: {
            id: true,
            username: true,
            createdAt: true,
            updatedAt: true
          }
        }
      }
    });
  }

  /**
   * Queries the database for multiple sets
   *
   * @param params.skip Optional, Prisma skip selector
   * @param params.take Optional, Prisma take selector
   * @param params.cursor Optional, Prisma cursor selector
   * @param params.where Optional, Prisma where selector
   * @param params.orderBy Optional, Prisma orderBy selector
   *
   * @returns Array of queried `Set` objects
   */
  async sets(params: {
    skip?: number;
    take?: number;
    cursor?: Prisma.SetWhereUniqueInput;
    where?: Prisma.SetWhereInput;
    orderBy?: Prisma.SetOrderByWithRelationInput;
  }): Promise<Set[]> {
    const { skip, take, cursor, where, orderBy } = params;
    return this.prisma.set.findMany({
      skip,
      take,
      cursor,
      where,
      orderBy,
      include: {
        cards: true,
        folders: true,
        author: {
          select: {
            id: true,
            username: true,
            createdAt: true,
            updatedAt: true
          }
        }
      }
    });
  }

  /**
   * Creates a set in the database
   *
   * @param data Prisma `SetCreateInput` selector
   *
   * @returns Created `Set` object
   */
  async createSet(data: Prisma.SetCreateInput): Promise<Set> {
    return this.prisma.set.create({
      data,
      include: {
        cards: true,
        folders: true,
        author: {
          select: {
            id: true,
            username: true,
            createdAt: true,
            updatedAt: true
          }
        }
      }
    });
  }

  /**
   * Updates a set in the database
   *
   * @param params.where Prisma where selector
   * @param params.data Prisma data selector
   *
   * @returns Updated `Set` object
   */
  async updateSet(params: {
    where: Prisma.SetWhereUniqueInput;
    data: Prisma.SetUpdateInput;
  }): Promise<Set> {
    const { where, data } = params;
    return this.prisma.set.update({
      data,
      where,
      include: {
        cards: true,
        folders: true,
        author: {
          select: {
            id: true,
            username: true,
            createdAt: true,
            updatedAt: true
          }
        }
      }
    });
  }

  /**
   * Deletes a set from the database
   *
   * @param where Prisma `SetWhereUniqueInput` selector
   *
   * @returns `Set` object that was deleted
   */
  async deleteSet(where: Prisma.SetWhereUniqueInput): Promise<Set> {
    return this.prisma.set.delete({
      where,
      include: {
        cards: true,
        folders: true,
        author: true
      }
    });
  }
}
