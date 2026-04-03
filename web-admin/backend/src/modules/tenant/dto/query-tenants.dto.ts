import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class QueryTenantsDto {
  @ApiPropertyOptional({
    description: 'Tìm kiếm theo tên hoặc domain',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description:
      'Lọc theo trạng thái triển khai (PENDING, DEPLOYING, RUNNING, FAILED)',
  })
  @IsOptional()
  @IsString()
  deployStatus?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo trạng thái xóa (true/false)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isDeleted?: boolean;

  @ApiPropertyOptional({
    description:
      'Sắp xếp theo trường (createdAt, updatedAt, name, deployStatus)',
    default: 'createdAt',
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({
    description: 'Thứ tự sắp xếp (asc, desc)',
    default: 'desc',
  })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';

  @ApiPropertyOptional({
    description: 'Số trang (bắt đầu từ 1)',
    default: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: 'Số lượng item trên 1 trang',
    default: 10,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number;
}
