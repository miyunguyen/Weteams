import { Module } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantController } from './tenant.controller';
import { TenantGateway } from './tenant.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { RocketChatModule } from '../rocketChat/rocketChat.module';

@Module({
  imports: [PrismaModule, RocketChatModule],
  providers: [TenantService, TenantGateway],
  controllers: [TenantController],
})
export class TenantModule {}
