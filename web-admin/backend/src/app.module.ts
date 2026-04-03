import { Module } from '@nestjs/common';
import { PrismaModule } from './modules/prisma/prisma.module';
import { TeamModule } from './modules/team/team.module';
import { RocketChatModule } from './modules/rocketChat/rocketChat.module';
import { CatModule } from './modules/cat/cat.module';
import { MessageModule } from './modules/message/message.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { UserModule } from './modules/user/user.module';

@Module({
  imports: [
    PrismaModule,
    TeamModule,
    RocketChatModule,
    CatModule,
    MessageModule,
    TenantModule,
    UserModule,
  ],
})
export class AppModule {}
