import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class FromAppUserDto {
  @ApiProperty({ description: 'Tenant id' })
  @IsString()
  tenantId: string;

  @ApiProperty({ description: 'Rocket user id from app context' })
  @IsString()
  userId: string;

  @ApiProperty({ description: 'Rocket username from app context' })
  @IsString()
  username: string;

  @ApiPropertyOptional({ description: 'Email from app context' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Display name from app context' })
  @IsOptional()
  @IsString()
  name?: string;
}
