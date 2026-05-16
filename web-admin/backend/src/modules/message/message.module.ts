import { Module } from '@nestjs/common';
import { MessageService } from './message.service';
import { MessageController } from './message.controller';
import { RocketChatModule } from '../rocketChat/rocketChat.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [RocketChatModule, PrismaModule],
  providers: [MessageService],
  controllers: [MessageController],
})
export class MessageModule {}
