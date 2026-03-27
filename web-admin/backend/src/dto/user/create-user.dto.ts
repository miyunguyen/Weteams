// src/dto/user/create-user.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiPropertyOptional({
    description: 'Display name of user',
    example: 'Alice',
  })
  name?: string;

  @ApiProperty({
    description: 'Unique user email',
    example: 'alice@example.com',
  })
  email: string;
}
