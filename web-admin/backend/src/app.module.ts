import { Module } from '@nestjs/common';
import { PrismaModule } from './modules/prisma/prisma.module';
import { TeamModule } from './modules/team/team.module';
import { RocketChatModule } from './modules/rocketChat/rocketChat.module';
import { CatModule } from './modules/cat/cat.module';

@Module({
  imports: [PrismaModule, TeamModule, RocketChatModule, CatModule],
})
export class AppModule {}
