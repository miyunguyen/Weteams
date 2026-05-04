import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  IsOptional,
} from 'class-validator';

export class LoginDto {
  @ApiPropertyOptional({
    description: 'Email đăng nhập',
    example: 'admin@weteams.local',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'Username đăng nhập',
    example: 'admin',
  })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiProperty({
    description: 'Mật khẩu đăng nhập',
    example: 'admin123',
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  password!: string;
}
