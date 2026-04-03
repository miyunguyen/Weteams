import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RocketChatModule } from '../rocketChat/rocketChat.module';

@Module({
  imports: [PrismaModule, RocketChatModule],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}
