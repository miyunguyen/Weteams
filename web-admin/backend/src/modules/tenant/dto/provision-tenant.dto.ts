import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';

export class ProvisionTenantDto {
  @ApiProperty({ description: 'Tên tenant/app' })
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Domain public của app tenant' })
  @IsString()
  domain!: string;

  @ApiPropertyOptional({
    description: 'Project name cho docker compose (unique)',
  })
  @IsOptional()
  @IsString()
  composeProjectName?: string;

  @ApiPropertyOptional({
    description: 'ROOT_URL, để trống sẽ tự build theo domain + hostPort',
  })
  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'rootUrl phải là URL hợp lệ' })
  rootUrl?: string;

  @ApiPropertyOptional({ default: '8.0.1' })
  @IsOptional()
  @IsString()
  release?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  regToken?: string;

  @ApiPropertyOptional({ default: 3000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  hostPort?: number;

  @ApiPropertyOptional({ default: 3000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @ApiPropertyOptional({ default: 9458 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  metricsPort?: number;

  @ApiPropertyOptional({ default: '0.0.0.0' })
  @IsOptional()
  @IsString()
  bindIp?: string;

  @ApiPropertyOptional({ default: 'admin' })
  @IsOptional()
  @IsString()
  adminUsername?: string;

  @ApiPropertyOptional({ default: 'admin123' })
  @IsOptional()
  @IsString()
  adminPass?: string;

  @ApiPropertyOptional({ default: '127.0.0.1' })
  @IsOptional()
  @IsString()
  mongodbBindIp?: string;

  @ApiPropertyOptional({ default: 27017 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  mongodbPortNumber?: number;

  @ApiPropertyOptional({ default: 27017 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  mongodbHostPortNumber?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mongodbHostPath?: string;

  @ApiPropertyOptional({ default: 4222 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  natsPortNumber?: number;

  @ApiPropertyOptional({ default: '127.0.0.1' })
  @IsOptional()
  @IsString()
  natsBindIp?: string;
}
