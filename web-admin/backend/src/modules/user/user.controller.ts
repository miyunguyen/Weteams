import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ImportUsersDto } from './dto/import-users.dto';
import { SearchUserDto } from './dto/search-user.dto';
import { FromAppUserDto } from './dto/from-app-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @HttpCode(201)
  @Post()
  createUser(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: { role?: string; tenantId?: string },
  ) {
    // Super admin may create for any tenant; tenant admin only for their tenant
    if (user?.role === 'ADMIN' && user.tenantId) {
      // enforce tenant scope
      dto.tenantId = user.tenantId;
    }

    return this.userService.createUser(dto);
  }

  @HttpCode(201)
  @Post('imports')
  @UseInterceptors(FileInterceptor('file'))
  importUsers(
    @UploadedFile() file: { buffer: Buffer },
    @Body() dto: ImportUsersDto,
    @CurrentUser() user: { role?: string; tenantId?: string },
  ) {
    // ensure tenant scope for non-super-admins
    if (user?.role === 'ADMIN' && user.tenantId) {
      dto.tenantId = user.tenantId;
    }
    return this.userService.importUsers(dto, file);
  }

  @HttpCode(200)
  @Get()
  searchUsers(
    @Query() dto: SearchUserDto,
    @CurrentUser() user: { role?: string; tenantId?: string },
  ) {
    // Super admin may query across tenants; admin and tenant users scoped to their tenant
    if (user?.role !== 'SUPER_ADMIN' && user.tenantId) {
      dto.tenantId = user.tenantId;
    }
    return this.userService.searchUsers(dto);
  }

  @HttpCode(200)
  @Post('sync-from-rocket')
  syncFromRocket(@Body() body: { tenantId: string }) {
    return this.userService.syncUsersFromRocket(body.tenantId);
  }

  @HttpCode(200)
  @Post('app-context')
  createFromApp(@Body() dto: FromAppUserDto) {
    return this.userService.createOrUpdateFromApp(dto);
  }

  @HttpCode(200)
  @Patch(':id')
  updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: { role?: string; tenantId?: string },
  ) {
    // Ensure tenant scope for non-super-admins
    if (user?.role !== 'SUPER_ADMIN' && user.tenantId) {
      dto.tenantId = user.tenantId;
    }
    return this.userService.updateUser({ ...dto, id });
  }

  @HttpCode(200)
  @Delete(':id')
  deleteUser(
    @Param('id') id: string,
    @CurrentUser() user: { role?: string; tenantId?: string },
  ) {
    return this.userService.deleteUser(id, user);
  }
}
