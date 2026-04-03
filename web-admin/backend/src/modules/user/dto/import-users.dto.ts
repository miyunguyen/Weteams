import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ImportUsersDto {
  @ApiProperty({ description: 'Tenant id' })
  @IsString()
  tenantId: string;
}
