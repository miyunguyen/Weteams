import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class SendTeamsMessageDto {
  @ApiProperty({
    description: 'Tenant Id.',
  })
  @IsString()
  tenantId!: string;

  @ApiProperty({
    description: 'Danh sách team id sẽ nhận tin nhắn.',
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  teamIds!: string[];

  @ApiProperty({
    description: 'Nội dung tin nhắn text.',
  })
  @IsString()
  text!: string;
}
