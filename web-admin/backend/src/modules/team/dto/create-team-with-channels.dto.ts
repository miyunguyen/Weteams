import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class CreateTeamWithChannelsDto {
  @ApiProperty({ description: 'Id of tenant.' })
  @IsString()
  tenantId: string;

  @ApiProperty({ description: 'Team name / parent room name.' })
  @IsString()
  roomName: string;

  @ApiProperty({
    description: 'Child channel suffix list, example: ["Toan", "Ly", "Van"]',
    type: [String],
  })
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  channelsName?: string[];
}
