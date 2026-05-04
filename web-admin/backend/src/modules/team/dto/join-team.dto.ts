import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class JoinTeamDto {
  @ApiProperty({
    description: 'Id of tenant.',
  })
  @IsString()
  tenantId: string;

  @ApiProperty({
    description: 'Join code.',
  })
  @IsString()
  joinCode: string;

  @ApiProperty({
    description: 'rocketUserId.',
  })
  @IsString()
  rocketUserId: string;

  @ApiProperty({
    description: 'rocket chat username.',
  })
  @IsString()
  rocketUsername: string;
}
