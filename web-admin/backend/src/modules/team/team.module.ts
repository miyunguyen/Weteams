import { Module } from '@nestjs/common';
import { TeamService } from './team.service';
import { TeamController } from './team.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { RocketChatModule } from '../rocketChat/rocketChat.module';

@Module({
  providers: [TeamService],
  controllers: [TeamController],
  imports: [PrismaModule, RocketChatModule],
})
export class TeamModule {}
