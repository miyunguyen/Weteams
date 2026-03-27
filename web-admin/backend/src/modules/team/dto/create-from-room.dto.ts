import { ApiProperty } from '@nestjs/swagger';

export class CreateFromRoomDto {
  @ApiProperty({
    description: 'Id of tenant.',
  })
  tenantId: string;

  @ApiProperty({
    description: 'Room id',
  })
  roomId: string;

  @ApiProperty({
    description: 'Room name',
  })
  roomName: string;
}
