import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

export enum UserRoleDto {
  TEACHER = 'TEACHER',
  STUDENT = 'STUDENT',
  PARENT = 'PARENT',
}

export class CreateUserDto {
  @ApiProperty({ description: 'Tenant id' })
  @IsString()
  tenantId: string;

  @ApiProperty({ description: 'Display name in Rocket.Chat' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Email in Rocket.Chat' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Password in Rocket.Chat' })
  @IsString()
  password: string;

  @ApiProperty({ description: 'Unique username in tenant' })
  @IsString()
  username: string;

  @ApiPropertyOptional({ enum: UserRoleDto })
  @IsOptional()
  @IsEnum(UserRoleDto)
  role?: UserRoleDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  citizenId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
