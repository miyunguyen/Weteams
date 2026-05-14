import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl } from 'class-validator';

export class UpdateTenantUrlsDto {
  @ApiProperty({ description: 'Tenant ID', required: true })
  @IsString()
  tenantId: string | undefined;

  @ApiProperty({ description: 'Root URL (optional)', required: false })
  @IsOptional()
  @IsString()
  @IsUrl()
  rootUrl?: string;

  @ApiProperty({ description: 'Rocket.Chat URL (optional)', required: false })
  @IsOptional()
  @IsString()
  @IsUrl()
  rocketUrl?: string;
}
