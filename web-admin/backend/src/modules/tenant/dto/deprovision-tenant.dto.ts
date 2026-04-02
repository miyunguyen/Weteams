import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class DeprovisionTenantDto {
  @ApiPropertyOptional({ description: 'Tenant id trong DB' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ description: 'compose project name của app tenant' })
  @IsOptional()
  @IsString()
  composeProjectName?: string;
}
