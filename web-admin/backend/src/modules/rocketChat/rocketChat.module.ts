import { Module } from '@nestjs/common';
import { RocketChatService } from './rocketChat.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  providers: [RocketChatService],
  exports: [RocketChatService],
  imports: [PrismaModule],
})
export class RocketChatModule {}
