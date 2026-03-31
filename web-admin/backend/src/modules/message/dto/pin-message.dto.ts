import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class PinMessageDto {
  @ApiProperty({
    description: 'Tenant Id.',
  })
  @IsString()
  tenantId: string;

  @ApiProperty({
    description: 'Rocket.Chat message id.',
  })
  @IsString()
  messageId: string;
}
