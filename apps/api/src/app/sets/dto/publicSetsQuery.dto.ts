import { IsIn, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";

export class PublicSetsQueryDto {
  @ApiProperty({ required: false, description: "Search by title or author username" })
  @IsString()
  @IsOptional()
    search?: string;

  @ApiProperty({ required: false, enum: ["newest", "oldest", "most_cards"], default: "newest" })
  @IsIn(["newest", "oldest", "most_cards"])
  @IsOptional()
    sort?: "newest" | "oldest" | "most_cards";

  @ApiProperty({ required: false, minimum: 1, default: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
    page?: number;

  @ApiProperty({ required: false, minimum: 1, maximum: 50, default: 20 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  @IsOptional()
    limit?: number;
}
