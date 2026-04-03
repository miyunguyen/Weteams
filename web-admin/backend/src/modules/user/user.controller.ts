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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ImportUsersDto } from './dto/import-users.dto';
import { SearchUserDto } from './dto/search-user.dto';
import { FromAppUserDto } from './dto/from-app-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @HttpCode(201)
  @Post()
  createUser(@Body() dto: CreateUserDto) {
    return this.userService.createUser(dto);
  }

  @HttpCode(201)
  @Post('imports')
  @UseInterceptors(FileInterceptor('file'))
  importUsers(
    @UploadedFile() file: { buffer: Buffer },
    @Body() dto: ImportUsersDto,
  ) {
    return this.userService.importUsers(dto, file);
  }

  @HttpCode(200)
  @Get()
  searchUsers(@Query() dto: SearchUserDto) {
    return this.userService.searchUsers(dto);
  }

  @HttpCode(200)
  @Post('app-context')
  createFromApp(@Body() dto: FromAppUserDto) {
    return this.userService.createOrUpdateFromApp(dto);
  }

  @HttpCode(200)
  @Patch(':id')
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.userService.updateUser({ ...dto, id });
  }

  @HttpCode(200)
  @Delete(':id')
  deleteUser(@Param('id') id: string) {
    return this.userService.deleteUser(id);
  }
}
