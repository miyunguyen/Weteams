import { Module } from '@nestjs/common';
import { PrismaModule } from './modules/prisma/prisma.module';
import { TeamModule } from './modules/team/team.module';
import { RocketModule } from './modules/rocket/rocket.module';

@Module({
  imports: [PrismaModule, TeamModule, RocketModule],
})
export class AppModule {}
