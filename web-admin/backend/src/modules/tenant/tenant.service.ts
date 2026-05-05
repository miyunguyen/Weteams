/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RocketChatService } from '../rocketChat/rocketChat.service';
import { ProvisionTenantDto } from './dto/provision-tenant.dto';
import { DeprovisionTenantDto } from './dto/deprovision-tenant.dto';
import { LoginTenantDto } from './dto/login-tenant.dto';
import { DeployAppDto } from './dto/deploy-app.dto';
import { QueryTenantsDto } from './dto/query-tenants.dto';
import { AppException } from '../../common/exceptions/app.exception';
import { TenantGateway } from './tenant.gateway';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import type { Prisma } from 'src/generated/prisma/client';
import axios from 'axios';

const execFileAsync = promisify(execFile);

type TenantDefaults = {
  release: string;
  regToken: string;
  hostPort: number;
  port: number;
  metricsPort: number;
  bindIp: string;
  adminUsername: string;
  adminPass: string;
  mongodbBindIp: string;
  mongodbPortNumber: number;
  mongodbHostPortNumber: number;
  natsPortNumber: number;
  natsBindIp: string;
};

@Injectable()
export class TenantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rocketChatService: RocketChatService,
    private readonly tenantGateway: TenantGateway,
  ) {}

  private emitTenantUpdated(
    tenantId: string,
    action: string,
    deployStatus?: string,
    updatedAt?: Date,
  ): void {
    this.tenantGateway.emitTenantUpdated({
      tenantId,
      action,
      deployStatus,
      updatedAt: updatedAt?.toISOString(),
    });
  }

  private checkTenantAccess(user: any, tenantId?: string): void {
    if (!user) {
      throw new AppException(HttpStatus.UNAUTHORIZED, {
        message: 'Chưa xác thực',
        errorCode: 'UNAUTHORIZED',
      });
    }

    // SUPER_ADMIN và ADMIN có quyền truy cập tất cả tenants
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
      return;
    }

    // TENANT_USER chỉ có quyền truy cập tenant được assigned
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (user.role === 'TENANT_USER') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (!tenantId || tenantId !== user.tenantId) {
        throw new AppException(HttpStatus.FORBIDDEN, {
          message: 'Bạn không có quyền để truy cập tenant này',
          errorCode: 'FORBIDDEN',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          data: { tenantId, userTenantId: user.tenantId },
        });
      }
      return;
    }

    throw new AppException(HttpStatus.FORBIDDEN, {
      message: 'Role không hợp lệ',
      errorCode: 'INVALID_ROLE',
    });
  }

  async provisionTenant(dto: ProvisionTenantDto, user?: any) {
    this.checkTenantAccess(user);

    const domain = this.normalizeDomain(dto.domain);
    if (!domain) {
      throw new AppException(HttpStatus.BAD_REQUEST, {
        message: 'Domain không hợp lệ',
        errorCode: 'INVALID_DOMAIN',
        data: { domain: dto.domain },
      });
    }

    const composeProjectName = this.normalizeProjectName(
      dto.composeProjectName,
      domain,
    );

    const defaults = this.buildDefaults();
    const resolved = await this.resolveProvisionInput(
      dto,
      defaults,
      domain,
      composeProjectName,
    );

    const existing = await this.prisma.tenant.findFirst({
      where: {
        OR: [
          { composeProjectName: resolved.composeProjectName },
          { domain: resolved.domain },
          { rootUrl: resolved.rootUrl },
        ],
      },
      select: { id: true },
    });

    const tenant = existing
      ? await this.prisma.tenant.update({
          where: { id: existing.id },
          data: {
            ...resolved,
            isDeleted: false,
            deletedAt: null,
            deployStatus: 'DEPLOYING',
            deployError: null,
          },
        })
      : await this.prisma.tenant.create({
          data: {
            ...resolved,
            deployStatus: 'DEPLOYING',
          },
        });

    this.emitTenantUpdated(
      tenant.id,
      'provision_started',
      'DEPLOYING',
      tenant.updatedAt,
    );

    try {
      const composeDir = this.resolveComposeDir();
      const envFileName = `.env.${resolved.composeProjectName}`;
      const envFilePath = path.join(composeDir, envFileName);

      await fs.writeFile(envFilePath, this.toEnvFileContent(resolved), 'utf8');
      try {
        await this.runCompose(
          composeDir,
          envFileName,
          resolved.composeProjectName,
        );
      } catch (error) {
        await this.cleanupFailedProvisionCompose(
          composeDir,
          resolved.composeProjectName,
          envFilePath,
        );
        throw error;
      }

      await this.safeDeleteFile(envFilePath);

      const loginAttempts = this.resolvePositiveIntEnv(
        'PROVISION_LOGIN_MAX_ATTEMPTS',
        24,
      );
      const loginDelayMs = this.resolvePositiveIntEnv(
        'PROVISION_LOGIN_DELAY_MS',
        5000,
      );
      const loginInitialDelayMs = this.resolvePositiveIntEnv(
        'PROVISION_LOGIN_INITIAL_DELAY_MS',
        5000,
      );

      if (loginInitialDelayMs > 0) {
        await this.sleep(loginInitialDelayMs);
      }

      const activation = await this.activateTenantLogin(
        tenant.id,
        loginAttempts,
        loginDelayMs,
      );

      if (!activation.success) {
        this.emitTenantUpdated(
          tenant.id,
          'provision_waiting_login',
          'DEPLOYING',
          tenant.updatedAt,
        );

        return {
          message:
            'Provision hoàn tất nhưng tenant chưa login được. Hãy gọi endpoint tenant/login sau ít phút.',
          data: {
            tenantId: tenant.id,
            composeProjectName: resolved.composeProjectName,
            rocketUrl: resolved.rocketUrl,
            deployStatus: 'DEPLOYING',
            reason: activation.reason,
          },
        };
      }

      let autoDeployResult:
        | {
            commandUsed: string;
            stdout: string;
            stderr: string;
          }
        | undefined;

      if (this.shouldAutoDeployAppEngineAfterProvision()) {
        try {
          const appEngineDir = this.resolveAppEngineDir();
          autoDeployResult = await this.runRcAppsDeploy(
            appEngineDir,
            activation.loginUrl,
            resolved.adminUsername,
            resolved.adminPass,
          );
        } catch (error) {
          return {
            message:
              'Provision và auto-login thành công, nhưng auto deploy app engine thất bại',
            data: {
              tenant: activation.tenant,
              composeProjectName: resolved.composeProjectName,
              rocketUrl: resolved.rocketUrl,
              deployStatus: 'RUNNING',
              reason: this.getErrorMessage(error),
            },
          };
        }
      }

      return {
        message: this.shouldAutoDeployAppEngineAfterProvision()
          ? 'Provision tenant + auto login + auto deploy app engine thành công'
          : 'Provision tenant + auto login thành công',
        data: {
          tenant: activation.tenant,
          envFile: envFilePath,
          composeProjectName: resolved.composeProjectName,
          rocketUrl: resolved.rocketUrl,
          autoDeployResult,
        },
      };
    } catch (error) {
      const failedTenant = await this.prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          deployStatus: 'FAILED',
          deployError: this.getErrorMessage(error),
        },
      });
      this.emitTenantUpdated(
        failedTenant.id,
        'provision_failed',
        'FAILED',
        failedTenant.updatedAt,
      );

      if (error instanceof AppException) {
        throw error;
      }

      throw new AppException(HttpStatus.BAD_REQUEST, {
        message: 'Provision tenant thất bại',
        errorCode: 'TENANT_PROVISION_FAILED',
        data: {
          tenantId: tenant.id,
          reason: this.getErrorMessage(error),
        },
      });
    }
  }

  async loginTenant(dto: LoginTenantDto, user?: any) {
    const tenant = await this.findTenantByIdentifier(
      this.cleanString(dto.tenantId),
      this.cleanString(dto.composeProjectName),
    );

    this.checkTenantAccess(user, tenant.id);

    // Always re-login and persist a fresh token for this tenant.
    const activation = await this.activateTenantLogin(
      tenant.id,
      dto.maxAttempts ?? 10,
      dto.delayMs ?? 5000,
    );

    if (!activation.success) {
      throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, {
        message: 'Tenant chưa sẵn sàng để login',
        errorCode: 'TENANT_LOGIN_NOT_READY',
        data: {
          tenantId: tenant.id,
          composeProjectName: tenant.composeProjectName,
          reason: activation.reason,
        },
      });
    }

    return {
      message: 'Login tenant thành công',
      data: {
        tenant: activation.tenant,
      },
    };
  }

  async deployTenantApp(dto: DeployAppDto, user?: any) {
    const tenantRef = await this.findTenantByIdentifier(
      this.cleanString(dto.tenantId),
      this.cleanString(dto.composeProjectName),
    );

    this.checkTenantAccess(user, tenantRef.id);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantRef.id },
      select: {
        id: true,
        composeProjectName: true,
        rocketUrl: true,
        hostPort: true,
        adminUsername: true,
        adminPass: true,
        isDeleted: true,
      },
    });

    if (!tenant) {
      throw new AppException(HttpStatus.NOT_FOUND, {
        message: 'Không tìm thấy tenant',
        errorCode: 'TENANT_NOT_FOUND',
        data: { tenantId: tenantRef.id },
      });
    }

    if (!tenant.adminUsername || !tenant.adminPass) {
      throw new AppException(HttpStatus.BAD_REQUEST, {
        message: 'Tenant chưa có admin credential',
        errorCode: 'TENANT_ADMIN_CREDENTIAL_MISSING',
        data: { tenantId: tenant.id },
      });
    }

    if ((tenant as { isDeleted?: boolean }).isDeleted) {
      throw new AppException(HttpStatus.BAD_REQUEST, {
        message: 'Tenant đã bị xoá',
        errorCode: 'TENANT_DELETED',
        data: {
          tenantId: tenant.id,
          composeProjectName: String(tenant.composeProjectName),
        },
      });
    }

    const activation = await this.activateTenantLogin(
      tenant.id,
      dto.maxAttempts ?? 10,
      dto.delayMs ?? 5000,
    );

    if (!activation.success) {
      throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, {
        message: 'Tenant chưa sẵn sàng để deploy app engine',
        errorCode: 'TENANT_NOT_READY_FOR_APP_DEPLOY',
        data: {
          tenantId: tenant.id,
          composeProjectName: String(tenant.composeProjectName),
          reason: activation.reason,
        },
      });
    }

    const appEngineDir = this.resolveAppEngineDir();
    const localRocketUrl = await this.resolveLocalRocketUrl(tenant.hostPort);
    const deployResult = await this.runRcAppsDeploy(
      appEngineDir,
      localRocketUrl,
      String(tenant.adminUsername),
      String(tenant.adminPass),
    );

    return {
      message: 'Deploy Rocket.Chat App Engine thành công',
      data: {
        tenantId: tenant.id,
        composeProjectName: String(tenant.composeProjectName),
        rocketUrl: tenant.rocketUrl,
        appEngineDir,
        ...deployResult,
      },
    };
  }

  async deprovisionTenant(dto: DeprovisionTenantDto, user?: any) {
    const tenant = await this.findTenantByIdentifier(
      this.cleanString(dto.tenantId),
      this.cleanString(dto.composeProjectName),
    );

    this.checkTenantAccess(user, tenant.id);

    const composeDir = this.resolveComposeDir();
    const resolvedComposeProjectName = String(tenant.composeProjectName);
    await this.runComposeDown(composeDir, resolvedComposeProjectName);

    const updatedTenant = await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deployStatus: 'PENDING',
        deployError: 'Tenant đã bị xoá mềm',
      },
    });
    this.emitTenantUpdated(
      updatedTenant.id,
      'deprovisioned',
      'PENDING',
      updatedTenant.updatedAt,
    );

    return {
      message: 'Deprovision tenant thành công',
      data: {
        tenantId: tenant.id,
        composeProjectName: resolvedComposeProjectName,
      },
    };
  }

  async updateTenantConfig(tenantId: string, user?: any) {
    const tenant = await this.findTenantByIdentifier(
      this.cleanString(tenantId),
      undefined,
    );

    this.checkTenantAccess(user, tenant.id);

    const currentTenant = await this.prisma.tenant.findUnique({
      where: { id: tenant.id },
      select: {
        id: true,
        composeProjectName: true,
        deployStatus: true,
        updatedAt: true,
      },
    });

    if (!currentTenant) {
      throw new AppException(HttpStatus.NOT_FOUND, {
        message: 'Không tìm thấy tenant',
        errorCode: 'TENANT_NOT_FOUND',
        data: { tenantId: tenant.id },
      });
    }

    this.emitTenantUpdated(
      currentTenant.id,
      'config_updated',
      currentTenant.deployStatus,
      currentTenant.updatedAt,
    );

    return {
      message: 'Đồng bộ cấu hình tenant thành công',
      data: {
        tenantId: currentTenant.id,
        composeProjectName: currentTenant.composeProjectName,
        deployStatus: currentTenant.deployStatus,
      },
    };
  }

  async restartTenantService(tenantId: string, user?: any) {
    const tenant = await this.findTenantByIdentifier(
      this.cleanString(tenantId),
      undefined,
    );

    this.checkTenantAccess(user, tenant.id);

    const currentTenant = await this.prisma.tenant.findUnique({
      where: { id: tenant.id },
      select: {
        id: true,
        composeProjectName: true,
        deployStatus: true,
        updatedAt: true,
      },
    });

    if (!currentTenant) {
      throw new AppException(HttpStatus.NOT_FOUND, {
        message: 'Không tìm thấy tenant',
        errorCode: 'TENANT_NOT_FOUND',
        data: { tenantId: tenant.id },
      });
    }

    const composeDir = this.resolveComposeDir();
    const baseArgs = [
      '-p',
      String(currentTenant.composeProjectName),
      '-f',
      'generated/docker-compose-no-traefik.yml',
      'restart',
    ];
    const { command, args } = this.resolveComposeCommand(baseArgs);

    try {
      await execFileAsync(command, args, { cwd: composeDir });
      this.emitTenantUpdated(
        currentTenant.id,
        'restart_completed',
        currentTenant.deployStatus,
        currentTenant.updatedAt,
      );

      return {
        message: 'Khởi động lại tenant thành công',
        data: {
          tenantId: currentTenant.id,
          composeProjectName: currentTenant.composeProjectName,
        },
      };
    } catch (error) {
      throw new AppException(HttpStatus.BAD_REQUEST, {
        message: 'Khởi động lại tenant thất bại',
        errorCode: 'TENANT_RESTART_FAILED',
        data: {
          tenantId: currentTenant.id,
          composeProjectName: currentTenant.composeProjectName,
          reason: this.getErrorMessage(error),
        },
      });
    }
  }

  async fetchTenantLogs(tenantId: string, user?: any) {
    const tenant = await this.findTenantByIdentifier(
      this.cleanString(tenantId),
      undefined,
    );

    this.checkTenantAccess(user, tenant.id);
    const currentTenant = await this.prisma.tenant.findUnique({
      where: { id: tenant.id },
      select: {
        id: true,
        composeProjectName: true,
      },
    });

    if (!currentTenant) {
      throw new AppException(HttpStatus.NOT_FOUND, {
        message: 'Không tìm thấy tenant',
        errorCode: 'TENANT_NOT_FOUND',
        data: { tenantId: tenant.id },
      });
    }

    const composeProjectName = String(currentTenant.composeProjectName);

    const composeDir = this.resolveComposeDir();
    const baseArgs = [
      '-p',
      composeProjectName,
      '-f',
      'generated/docker-compose-no-traefik.yml',
      'logs',
      '--tail',
      '200',
    ];
    const { command, args } = this.resolveComposeCommand(baseArgs);

    try {
      const result = await execFileAsync(command, args, { cwd: composeDir });
      return {
        message: 'Lấy logs tenant thành công',
        data: result.stdout || result.stderr || '',
      };
    } catch (error) {
      throw new AppException(HttpStatus.BAD_REQUEST, {
        message: 'Lấy logs tenant thất bại',
        errorCode: 'TENANT_LOGS_FAILED',
        data: {
          tenantId: currentTenant.id,
          composeProjectName,
          reason: this.getErrorMessage(error),
        },
      });
    }
  }

  async getTenantDetail(tenantId: string, user?: any) {
    const tenant = await this.findTenantByIdentifier(
      this.cleanString(tenantId),
      undefined,
    );

    this.checkTenantAccess(user, tenant.id);

    const detail = await this.prisma.tenant.findUnique({
      where: { id: tenant.id },
      include: {
        _count: {
          select: {
            users: true,
            teams: true,
          },
        },
      },
    });

    if (!detail) {
      throw new AppException(HttpStatus.NOT_FOUND, {
        message: 'Không tìm thấy tenant',
        errorCode: 'TENANT_NOT_FOUND',
        data: { tenantId: tenant.id },
      });
    }

    return {
      message: 'Lấy chi tiết tenant thành công',
      data: detail,
    };
  }

  private async findTenantByIdentifier(
    tenantId: string | undefined,
    composeProjectName: string | undefined,
  ): Promise<{ id: string; composeProjectName: string }> {
    if (!tenantId && !composeProjectName) {
      throw new AppException(HttpStatus.BAD_REQUEST, {
        message: 'Cần truyền tenantId hoặc composeProjectName',
        errorCode: 'TENANT_IDENTIFIER_REQUIRED',
        data: null,
      });
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: {
        OR: [
          tenantId ? { id: tenantId } : undefined,
          composeProjectName ? { composeProjectName } : undefined,
        ].filter(Boolean) as Prisma.TenantWhereInput[],
      },
      select: {
        id: true,
        composeProjectName: true,
        isDeleted: true,
      },
    });

    if (!tenant) {
      throw new AppException(HttpStatus.NOT_FOUND, {
        message: 'Không tìm thấy tenant',
        errorCode: 'TENANT_NOT_FOUND',
        data: {
          tenantId: tenantId ?? null,
          composeProjectName: composeProjectName ?? null,
        },
      });
    }

    if ((tenant as { isDeleted?: boolean }).isDeleted) {
      throw new AppException(HttpStatus.BAD_REQUEST, {
        message: 'Tenant đã bị xoá',
        errorCode: 'TENANT_DELETED',
        data: {
          tenantId: tenant.id,
          composeProjectName: String(tenant.composeProjectName),
        },
      });
    }

    return {
      id: tenant.id,
      composeProjectName: String(tenant.composeProjectName),
    };
  }

  private async activateTenantLogin(
    tenantId: string,
    maxAttempts: number,
    delayMs: number,
  ): Promise<
    | {
        success: true;
        tenant: unknown;
        loginUrl: string;
      }
    | {
        success: false;
        reason: string;
      }
  > {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        rocketUrl: true,
        hostPort: true,
        adminUsername: true,
        adminPass: true,
        isDeleted: true,
      },
    });

    if (!tenant) {
      throw new AppException(HttpStatus.NOT_FOUND, {
        message: 'Không tìm thấy tenant',
        errorCode: 'TENANT_NOT_FOUND',
        data: { tenantId },
      });
    }

    if (!tenant.adminUsername || !tenant.adminPass) {
      throw new AppException(HttpStatus.BAD_REQUEST, {
        message: 'Tenant chưa có admin credential',
        errorCode: 'TENANT_ADMIN_CREDENTIAL_MISSING',
        data: { tenantId },
      });
    }

    if ((tenant as { isDeleted?: boolean }).isDeleted) {
      throw new AppException(HttpStatus.BAD_REQUEST, {
        message: 'Tenant đã bị xoá',
        errorCode: 'TENANT_DELETED',
        data: { tenantId },
      });
    }

    let lastError = 'Tenant chưa sẵn sàng';
    const localHosts = this.getLocalHostCandidates();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      for (const host of localHosts) {
        const localRocketUrl = this.buildLocalRocketUrl(host, tenant.hostPort);

        try {
          const healthy = await this.checkRocketHealth(localRocketUrl);
          if (!healthy) {
            lastError = `Health check chưa pass ở ${localRocketUrl}`;
            continue;
          }

          const login = await this.rocketChatService.loginWithCredentials(
            localRocketUrl,
            String(tenant.adminUsername),
            String(tenant.adminPass),
          );

          const updatedTenant = await this.prisma.tenant.update({
            where: { id: tenant.id },
            data: {
              adminUserId: login.userId,
              adminAuthToken: login.authToken,
              adminTokenExpireAt: null,
              deployStatus: 'RUNNING',
              deployError: null,
              lastProvisionedAt: new Date(),
            },
          });

          this.emitTenantUpdated(
            updatedTenant.id,
            'login_success',
            'RUNNING',
            updatedTenant.updatedAt,
          );

          return {
            success: true,
            tenant: updatedTenant,
            loginUrl: localRocketUrl,
          };
        } catch (error) {
          lastError = `${this.getErrorMessage(error)} @ ${localRocketUrl}`;
        }
      }

      if (attempt < maxAttempts) {
        await this.sleep(delayMs);
      }
    }

    const pendingTenant = await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        deployStatus: 'DEPLOYING',
        deployError: lastError,
      },
    });
    this.emitTenantUpdated(
      pendingTenant.id,
      'login_retrying',
      'DEPLOYING',
      pendingTenant.updatedAt,
    );

    return {
      success: false,
      reason: lastError,
    };
  }

  private async checkRocketHealth(baseUrl: string): Promise<boolean> {
    try {
      const res = await axios.get(`${baseUrl}/api/info`, {
        timeout: 4000,
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 300,
      });
      return res.status >= 200 && res.status < 300;
    } catch {
      return false;
    }
  }

  private async resolveProvisionInput(
    dto: ProvisionTenantDto,
    defaults: TenantDefaults,
    domain: string,
    composeProjectName: string,
  ) {
    const hostPort =
      dto.hostPort ??
      (await this.allocatePort('hostPort', defaults.hostPort, 3000));

    const rootUrl =
      this.cleanString(dto.rootUrl) ?? this.buildRootUrl(domain, hostPort);
    const metricsPort =
      dto.metricsPort ??
      (await this.allocatePort('metricsPort', defaults.metricsPort, 9458));
    const mongodbHostPortNumber =
      dto.mongodbHostPortNumber ??
      (await this.allocatePort(
        'mongodbHostPortNumber',
        defaults.mongodbHostPortNumber,
        27017,
      ));
    const natsPortNumber =
      dto.natsPortNumber ??
      (await this.allocatePort(
        'natsPortNumber',
        defaults.natsPortNumber,
        4222,
      ));

    return {
      name: this.cleanString(dto.name) ?? domain,
      composeProjectName,
      domain,
      rootUrl,
      rocketUrl: rootUrl,
      release: this.cleanString(dto.release) ?? defaults.release,
      regToken: this.cleanString(dto.regToken) ?? defaults.regToken,
      hostPort,
      port: dto.port ?? defaults.port,
      metricsPort,
      bindIp: this.cleanString(dto.bindIp) ?? defaults.bindIp,
      adminUsername:
        this.cleanString(dto.adminUsername) ?? defaults.adminUsername,
      adminPass: this.cleanString(dto.adminPass) ?? defaults.adminPass,
      mongodbBindIp:
        this.cleanString(dto.mongodbBindIp) ?? defaults.mongodbBindIp,
      mongodbPortNumber: dto.mongodbPortNumber ?? defaults.mongodbPortNumber,
      mongodbHostPortNumber,
      natsPortNumber,
      natsBindIp: this.cleanString(dto.natsBindIp) ?? defaults.natsBindIp,
      envRaw: JSON.parse(JSON.stringify(dto)) as Prisma.InputJsonValue,
    };
  }

  private buildDefaults(): TenantDefaults {
    return {
      release: '8.0.1',
      regToken: '',
      hostPort: 3000,
      port: 3000,
      metricsPort: 9458,
      bindIp: '0.0.0.0',
      adminUsername: 'admin',
      adminPass: 'admin123',
      mongodbBindIp: '127.0.0.1',
      mongodbPortNumber: 27017,
      mongodbHostPortNumber: 27017,
      natsPortNumber: 4222,
      natsBindIp: '127.0.0.1',
    };
  }

  private async allocatePort(
    field:
      | 'hostPort'
      | 'metricsPort'
      | 'mongodbHostPortNumber'
      | 'natsPortNumber',
    fallback: number,
    base: number,
  ): Promise<number> {
    const tenants = await this.prisma.tenant.findMany({
      select: {
        hostPort: true,
        metricsPort: true,
        mongodbHostPortNumber: true,
        natsPortNumber: true,
      },
    });

    const used = new Set<number>();
    for (const tenant of tenants) {
      const value = tenant[field];
      if (typeof value === 'number') {
        used.add(value);
      }
    }

    if (!used.has(fallback)) {
      return fallback;
    }

    let candidate = base;
    while (used.has(candidate)) {
      candidate += 1;
    }

    return candidate;
  }

  private resolveComposeDir(): string {
    return this.resolveExternalDirectory(
      process.env.ROCKETCHAT_COMPOSE_DIR,
      'rocketchat-compose',
    );
  }

  private resolveAppEngineDir(): string {
    return this.resolveExternalDirectory(
      process.env.ROCKETCHAT_APP_ENGINE_DIR,
      'my-rocket-chat',
    );
  }

  private resolveExternalDirectory(
    envValue: string | undefined,
    folderName: string,
  ): string {
    const explicitPath = this.cleanString(envValue);
    if (explicitPath) {
      return path.resolve(explicitPath);
    }

    const candidates = [
      path.resolve(process.cwd(), folderName),
      path.resolve('/', 'workspace', folderName),
      path.resolve(process.cwd(), '../../', folderName),
      path.resolve(process.cwd(), '../', folderName),
      path.resolve(__dirname, '../../../../../', folderName),
      path.resolve(__dirname, '../../../../', folderName),
      path.resolve(__dirname, '../../../', folderName),
    ];

    const existingPath = candidates.find((candidate) => existsSync(candidate));
    return existingPath ?? candidates[0];
  }

  private resolveComposeCommand(baseArgs: string[]): {
    command: string;
    args: string[];
  } {
    const engine = this.cleanString(process.env.PROVISION_COMPOSE_RUNTIME);
    const command = engine || 'docker';
    const isDockerComposeBinary = command.endsWith('docker-compose');

    if (isDockerComposeBinary) {
      return { command, args: baseArgs };
    }

    return { command, args: ['compose', ...baseArgs] };
  }

  private shouldAutoDeployAppEngineAfterProvision(): boolean {
    const value = this.cleanString(
      process.env.PROVISION_AUTO_DEPLOY_APP_ENGINE,
    );
    if (!value) {
      return true;
    }

    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  }

  private resolvePositiveIntEnv(key: string, fallback: number): number {
    const value = this.cleanString(process.env[key]);
    if (!value) {
      return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }

    return parsed;
  }

  private async runRcAppsDeploy(
    appEngineDir: string,
    serverUrl: string,
    username: string,
    password: string,
  ): Promise<{
    commandUsed: string;
    stdout: string;
    stderr: string;
  }> {
    const preferredCommand =
      this.cleanString(process.env.RC_APPS_COMMAND) ?? 'rc-apps';
    const deployArgs = [
      'deploy',
      '--url',
      serverUrl,
      '-u',
      username,
      '-p',
      password,
    ];

    try {
      const direct = await execFileAsync(preferredCommand, deployArgs, {
        cwd: appEngineDir,
        shell: true,
      });

      return {
        commandUsed: `${preferredCommand} ${deployArgs.join(' ')}`,
        stdout: direct.stdout,
        stderr: direct.stderr,
      };
    } catch (directError) {
      const directStdout = (directError as { stdout?: string })?.stdout;
      const directStderr = (directError as { stderr?: string })?.stderr;

      throw new AppException(HttpStatus.BAD_REQUEST, {
        message: 'Deploy Rocket.Chat App Engine thất bại',
        errorCode: 'RC_APPS_DEPLOY_FAILED',
        data: {
          appEngineDir,
          serverUrl,
          command: `${preferredCommand} ${deployArgs.join(' ')}`,
          stdout: directStdout ?? null,
          stderr: directStderr ?? null,
        },
      });
    }
  }

  private async runCompose(
    composeDir: string,
    envFileName: string,
    composeProjectName: string,
  ): Promise<void> {
    const baseArgs = [
      '-p',
      composeProjectName,
      '--env-file',
      envFileName,
      '-f',
      'generated/docker-compose-no-traefik.yml',
      'up',
      '-d',
    ];
    const { command, args } = this.resolveComposeCommand(baseArgs);

    try {
      await execFileAsync(command, args, { cwd: composeDir });
    } catch (error) {
      const stderr = (error as { stderr?: string })?.stderr;
      throw new AppException(HttpStatus.BAD_REQUEST, {
        message: 'Chạy compose thất bại',
        errorCode: 'COMPOSE_UP_FAILED',
        data: {
          composeDir,
          command: `${command} ${args.join(' ')}`,
          stderr: stderr ?? null,
        },
      });
    }
  }

  private async cleanupFailedProvisionCompose(
    composeDir: string,
    composeProjectName: string,
    envFilePath: string,
  ): Promise<void> {
    try {
      await this.runComposeDown(composeDir, composeProjectName);
    } catch {
      // ignore cleanup errors so the original compose failure is preserved
    }

    await this.safeDeleteFile(envFilePath);
  }

  private async runComposeDown(
    composeDir: string,
    composeProjectName: string,
  ): Promise<void> {
    const baseArgs = [
      '-p',
      composeProjectName,
      '-f',
      'generated/docker-compose-no-traefik.yml',
      'down',
      '-v',
    ];
    const { command, args } = this.resolveComposeCommand(baseArgs);

    try {
      await execFileAsync(command, args, { cwd: composeDir });
    } catch (error) {
      const stderr = (error as { stderr?: string })?.stderr;
      throw new AppException(HttpStatus.BAD_REQUEST, {
        message: 'Chạy compose down thất bại',
        errorCode: 'COMPOSE_DOWN_FAILED',
        data: {
          composeDir,
          command: `${command} ${args.join(' ')}`,
          stderr: stderr ?? null,
        },
      });
    }
  }

  private async safeDeleteFile(filePath: string): Promise<void> {
    try {
      await fs.rm(filePath, { force: true });
    } catch {
      // keep deprovision idempotent when env file does not exist
    }
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private toEnvFileContent(input: {
    regToken: string;
    rootUrl: string;
    release: string;
    composeProjectName: string;
    hostPort: number;
    port: number;
    metricsPort: number;
    bindIp: string;
    adminUsername: string;
    adminPass: string;
    mongodbBindIp: string;
    mongodbPortNumber: number;
    mongodbHostPortNumber: number;
    natsPortNumber: number;
    natsBindIp: string;
  }): string {
    return [
      '#!/bin/sh',
      `REG_TOKEN=${input.regToken}`,
      `ROOT_URL=${input.rootUrl}`,
      `RELEASE=${input.release}`,
      `COMPOSE_PROJECT_NAME=${input.composeProjectName}`,
      `HOST_PORT=${input.hostPort}`,
      `PORT=${input.port}`,
      `METRICS_PORT=${input.metricsPort}`,
      `BIND_IP=${input.bindIp}`,
      `ADMIN_USERNAME=${input.adminUsername}`,
      `ADMIN_PASS=${input.adminPass}`,
      `MONGODB_BIND_IP=${input.mongodbBindIp}`,
      `MONGODB_PORT_NUMBER=${input.mongodbPortNumber}`,
      `MONGODB_HOST_PORT_NUMBER=${input.mongodbHostPortNumber}`,
      `NATS_PORT_NUMBER=${input.natsPortNumber}`,
      `NATS_BIND_IP=${input.natsBindIp}`,
      '',
    ].join('\n');
  }

  private normalizeDomain(domain: string): string {
    const value = this.cleanString(domain);
    if (!value) {
      return '';
    }

    return value
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*/, '')
      .replace(/:\d+$/, '')
      .toLowerCase();
  }

  private normalizeProjectName(
    composeProjectName: string | undefined,
    domain: string,
  ): string {
    const preferred = this.cleanString(composeProjectName);
    if (preferred) {
      return this.slugify(preferred);
    }

    return this.slugify(domain.split('.')[0] ?? domain);
  }

  private slugify(input: string): string {
    const value = input
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return value || 'tenant';
  }

  async getTenantsList(query: QueryTenantsDto, user?: any) {
    const page = this.parsePositiveIntQuery(query.page, 1);
    const pageSize = this.parsePositiveIntQuery(query.pageSize, 10);
    const skip = (page - 1) * pageSize;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';
    const isDeleted = this.parseBooleanQuery(query.isDeleted, false);

    // Build where clause
    interface TenantWhere {
      isDeleted: boolean;
      OR?: any[];
      deployStatus?: any;
      id?: any;
    }
    const where: TenantWhere = {
      isDeleted,
    };

    // Filter tenants based on user role
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (user && user.role === 'TENANT_USER' && user.tenantId) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      where.id = user.tenantId;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { domain: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.deployStatus) {
      where.deployStatus = query.deployStatus;
    }

    // Get total count
    const total = await this.prisma.tenant.count({ where: where as any });

    // Build orderBy
    const validSortFields = ['createdAt', 'updatedAt', 'name', 'deployStatus'];
    const orderByField = validSortFields.includes(sortBy)
      ? sortBy
      : 'createdAt';
    const orderBy: Record<string, 'asc' | 'desc'> = {
      [orderByField]: sortOrder,
    };

    // Get paginated data
    const tenants = await this.prisma.tenant.findMany({
      where: where as any,
      select: {
        id: true,
        name: true,
        domain: true,
        rootUrl: true,
        rocketUrl: true,
        composeProjectName: true,
        deployStatus: true,
        deployError: true,
        createdAt: true,
        updatedAt: true,
        lastProvisionedAt: true,
      },
      orderBy: orderBy as any,
      skip,
      take: pageSize,
    });

    return {
      message: 'Lấy danh sách tenant thành công',
      data: {
        items: tenants,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    };
  }

  private buildRootUrl(domain: string, appPort: number): string {
    if (appPort === 80) {
      return `http://${domain}`;
    }

    return `http://${domain}:${appPort}`;
  }

  private async resolveLocalRocketUrl(hostPort: number): Promise<string> {
    const candidates = this.getLocalHostCandidates();

    for (const host of candidates) {
      const candidateUrl = this.buildLocalRocketUrl(host, hostPort);
      const healthy = await this.checkRocketHealth(candidateUrl);
      if (healthy) {
        return candidateUrl;
      }
    }

    return this.buildLocalRocketUrl(
      candidates[0] ?? 'host.docker.internal',
      hostPort,
    );
  }

  private getLocalHostCandidates(): string[] {
    const configuredHosts = this.cleanString(process.env.PROVISION_LOCAL_HOSTS)
      ?.split(',')
      .map((host) => host.trim())
      .filter((host) => host.length > 0);

    if (configuredHosts && configuredHosts.length > 0) {
      return Array.from(new Set(configuredHosts));
    }

    const configuredHost = this.cleanString(process.env.PROVISION_LOCAL_HOST);
    if (configuredHost) {
      return Array.from(
        new Set([
          configuredHost,
          'host.docker.internal',
          '127.0.0.1',
          'localhost',
        ]),
      );
    }

    return ['host.docker.internal', '127.0.0.1', 'localhost'];
  }

  private buildLocalRocketUrl(host: string, hostPort: number): string {
    return `http://${host}:${hostPort}`;
  }

  private cleanString(value: string | undefined): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return 'Unknown error';
  }

  private parseBooleanQuery(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
    }

    return fallback;
  }

  private parsePositiveIntQuery(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isInteger(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return fallback;
  }
}
