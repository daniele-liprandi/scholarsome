import { ApiProperty } from "@nestjs/swagger";
import { PublicSetSetsEntity } from "../public-set.sets.entity";

export class PublicSetsData {
  @ApiProperty({ type: [PublicSetSetsEntity] })
    sets: PublicSetSetsEntity[];

  @ApiProperty({ example: 100 })
    total: number;

  @ApiProperty({ example: 1 })
    page: number;

  @ApiProperty({ example: 20 })
    limit: number;
}

export class PublicSetsSuccessResponse {
  @ApiProperty({ example: "success" })
    status: string;

  @ApiProperty({ type: PublicSetsData })
    data: PublicSetsData;
}
