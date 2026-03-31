import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class DeleteTeamDto {
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
}
