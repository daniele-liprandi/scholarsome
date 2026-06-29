import { ApiProperty } from "@nestjs/swagger";

export class PublicSetAuthorEntity {
  @ApiProperty({ example: "1e3e00cf-6705-496a-b742-752cb30c6a6b" })
    id: string;

  @ApiProperty({ example: "alice" })
    username: string;
}

export class PublicSetSetsEntity {
  @ApiProperty({ example: "77a72340-0b91-499e-9a06-0eee498d5aec" })
    id: string;

  @ApiProperty({ example: "Spanish Vocabulary" })
    title: string;

  @ApiProperty({ required: false, example: "Useful phrases for travel" })
    description: string | null;

  @ApiProperty({ type: PublicSetAuthorEntity })
    author: PublicSetAuthorEntity;

  @ApiProperty({ example: 42 })
    cardCount: number;

  @ApiProperty({ example: "1970-01-01T00:00:00.000Z" })
    createdAt: Date;

  @ApiProperty({ example: "1970-01-01T00:00:00.000Z" })
    updatedAt: Date;
}
