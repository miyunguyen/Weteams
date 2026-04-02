import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class LoginTenantDto {
  @ApiPropertyOptional({ description: 'Tenant id trong DB' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ description: 'compose project name của app tenant' })
  @IsOptional()
  @IsString()
  composeProjectName?: string;

  @ApiPropertyOptional({ description: 'Số lần retry login', default: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  maxAttempts?: number;

  @ApiPropertyOptional({
    description: 'Thời gian chờ giữa các lần retry (ms)',
    default: 5000,
  })
  @IsOptional()
  @IsInt()
  @Min(500)
  @Max(60000)
  delayMs?: number;
}
