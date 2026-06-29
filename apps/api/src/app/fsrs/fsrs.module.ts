import { Module } from "@nestjs/common";
import { FsrsController } from "./fsrs.controller";
import { FsrsService } from "./fsrs.service";
import { DatabaseModule } from "../providers/database/database.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [FsrsController],
  providers: [FsrsService]
})
export class FsrsModule {}
