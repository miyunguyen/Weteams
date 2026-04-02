import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { ProvisionTenantDto } from './dto/provision-tenant.dto';
import { DeprovisionTenantDto } from './dto/deprovision-tenant.dto';
import { LoginTenantDto } from './dto/login-tenant.dto';
import { DeployAppDto } from './dto/deploy-app.dto';

@Controller('tenant')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @HttpCode(201)
  @Post('provision')
  provision(@Body() dto: ProvisionTenantDto) {
    return this.tenantService.provisionTenant(dto);
  }

  @HttpCode(200)
  @Post('deprovision')
  deprovision(@Body() dto: DeprovisionTenantDto) {
    return this.tenantService.deprovisionTenant(dto);
  }

  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginTenantDto) {
    return this.tenantService.loginTenant(dto);
  }

  @HttpCode(200)
  @Post('deploy-app')
  deployApp(@Body() dto: DeployAppDto) {
    return this.tenantService.deployTenantApp(dto);
  }
}
