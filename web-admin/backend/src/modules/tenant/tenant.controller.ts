import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TenantService } from './tenant.service';
import { UserService } from '../user/user.service';
import { TeamService } from '../team/team.service';
import { ProvisionTenantDto } from './dto/provision-tenant.dto';
import { CreateTenantAdminDto } from './dto/create-tenant-admin.dto';
import { DeprovisionTenantDto } from './dto/deprovision-tenant.dto';
import { LoginTenantDto } from './dto/login-tenant.dto';
import { DeployAppDto } from './dto/deploy-app.dto';
import { QueryTenantsDto } from './dto/query-tenants.dto';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('tenants')
@UseGuards(JwtAuthGuard)
export class TenantController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly userService: UserService,
    private readonly teamService: TeamService,
  ) {}

  @HttpCode(201)
  @Post()
  provision(@Body() dto: ProvisionTenantDto, @CurrentUser() user: any) {
    return this.tenantService.provisionTenant(dto, user);
  }

  @HttpCode(200)
  @Delete()
  deprovision(@Body() dto: DeprovisionTenantDto, @CurrentUser() user: any) {
    return this.tenantService.deprovisionTenant(dto, user);
  }

  @HttpCode(200)
  @Post('sessions')
  login(@Body() dto: LoginTenantDto, @CurrentUser() user: any) {
    return this.tenantService.loginTenant(dto, user);
  }

  @HttpCode(200)
  @Post('deployments')
  deployApp(@Body() dto: DeployAppDto, @CurrentUser() user: any) {
    return this.tenantService.deployTenantApp(dto, user);
  }

  @HttpCode(200)
  @Post(':tenantId/config')
  updateConfig(@Param('tenantId') tenantId: string, @CurrentUser() user: any) {
    return this.tenantService.updateTenantConfig(tenantId, user);
  }

  @HttpCode(200)
  @Post(':tenantId/restart')
  restartService(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.tenantService.restartTenantService(tenantId, user);
  }

  @HttpCode(200)
  @Get(':tenantId/logs')
  fetchLogs(@Param('tenantId') tenantId: string, @CurrentUser() user: any) {
    return this.tenantService.fetchTenantLogs(tenantId, user);
  }

  @HttpCode(200)
  @Get(':tenantId/detail')
  getDetail(@Param('tenantId') tenantId: string, @CurrentUser() user: any) {
    return this.tenantService.getTenantDetail(tenantId, user);
  }

  @HttpCode(200)
  @Get(':tenantId/users')
  getTenantUsers(@Param('tenantId') tenantId: string, @Query() query: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const dto = { ...(query || {}), tenantId };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return this.userService.searchUsers(dto);
  }

  @HttpCode(200)
  @Get(':tenantId/teams')
  getTenantTeams(@Param('tenantId') tenantId: string, @Query() query: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const dto = { ...(query || {}), tenantId };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return this.teamService.searchTeams(dto);
  }

  @HttpCode(200)
  @Get()
  getTenantsList(@Query() query: QueryTenantsDto, @CurrentUser() user: any) {
    return this.tenantService.getTenantsList(query, user);
  }

  @HttpCode(201)
  @Post(':tenantId/admins')
  createTenantAdmin(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateTenantAdminDto,
    @CurrentUser() user: any,
  ) {
    return this.tenantService.createTenantAdmin(tenantId, dto, user);
  }
}
