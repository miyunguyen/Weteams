import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class LeaveTeamDto {
  @ApiProperty({
    description: 'Tenant Id',
  })
  @IsString()
  tenantId: string;

  @ApiProperty({
    description: 'Room id',
  })
  @IsString()
  roomId: string;

  @ApiProperty({
    description: 'Rocket chat user id',
  })
  @IsString()
  rocketUserId: string;
}
