import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

export class SearchUserDto {
  @ApiProperty({ description: 'Tenant id' })
  @IsString()
  tenantId: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 200 })
  @IsOptional()
  pageSize?: number;

  @ApiPropertyOptional({
    description: 'Global keyword for name/email/username/citizenId/phoneNumber',
  })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({
    description: 'Dynamic filters by fields in user model',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Alias of filters, useful when client sends { data: {...} }',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}
