import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class PinMessageDto {
  @ApiProperty({
    description: 'Tenant Id.',
  })
  @IsString()
  tenantId: string;
}
