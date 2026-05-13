import { Module } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantController } from './tenant.controller';
import { TenantGateway } from './tenant.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { RocketChatModule } from '../rocketChat/rocketChat.module';
import { UserModule } from '../user/user.module';
import { TeamModule } from '../team/team.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, RocketChatModule, UserModule, TeamModule, AuthModule],
  providers: [TenantService, TenantGateway],
  controllers: [TenantController],
})
export class TenantModule {}
