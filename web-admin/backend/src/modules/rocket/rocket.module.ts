import { Module } from '@nestjs/common';
import { RocketService } from './rocket.service';

@Module({
  providers: [RocketService],
  exports: [RocketService],
})
export class RocketModule {}
