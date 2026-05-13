import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class CreateTenantAdminDto {
  @ApiProperty({ description: 'Admin email' })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'Admin username' })
  @IsString()
  username!: string;

  @ApiProperty({ description: 'Admin password' })
  @IsString()
  password!: string;

  @ApiProperty({
    description: 'Role for web admin (ADMIN by default)',
    required: false,
  })
  @IsOptional()
  @IsString()
  role?: string;
}
