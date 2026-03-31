import { Module } from '@nestjs/common';
import { MessageService } from './message.service';
import { MessageController } from './message.controller';
import { RocketChatModule } from '../rocketChat/rocketChat.module';

@Module({
  imports: [RocketChatModule],
  providers: [MessageService],
  controllers: [MessageController],
})
export class MessageModule {}
