import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { SetsModule } from "../../sets/sets.module";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";

@Module({
  imports: [HttpModule, SetsModule],
  controllers: [AiController],
  providers: [AiService]
})
export class AiModule {}
