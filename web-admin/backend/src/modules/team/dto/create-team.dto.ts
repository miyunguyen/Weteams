import { ApiProperty } from '@nestjs/swagger';

export class CreateTeamDto {
  @ApiProperty({
    description: 'The team name.',
  })
  name: string;

  @ApiProperty({
    description: 'Privacy of the team (0 - Public, 1 - Private).',
  })
  type: number;

  @ApiProperty({
    description: 'Id of tenant.',
  })
  tenantId: string;

  @ApiProperty({
    description: 'Owner id of the team',
  })
  ownerRocketUserId?: string;
}
