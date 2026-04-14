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
  letsencryptEnabled: boolean;
  letsencryptEmail: string;
  traefikProtocol: string;
  hostPort: number;
  port: number;
  metricsPort: number;
  bindIp: string;
  adminUsername: string;
  adminPass: string;
  prometheusRetentionSize: string;
  prometheusRetentionTime: string;
  prometheusPort: number;
  grafanaDomain: string;
  grafanaPath: string;
  grafanaAdminPassword: string;
  grafanaHostPort: number;
  grafanaBindIp: string;
  traefikHttpPort: number;
  traefikDashboardPort: number;
  traefikHttpsPort: number;
  mongodbBindIp: string;
  mongodbPortNumber: number;
  mongodbHostPortNumber: number;
  mongodbHostPath: string;
  natsPortNumber: number;
  natsBindIp: string;
};

@Injectable()
export class TenantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rocketChatService: RocketChatService,
  ) {}

  async provisionTenant(dto: ProvisionTenantDto) {
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

    const defaults = await this.buildDefaults();
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

      const activation = await this.activateTenantLogin(
        tenant.id,
        Number(process.env.PROVISION_LOGIN_MAX_ATTEMPTS ?? 12),
        Number(process.env.PROVISION_LOGIN_DELAY_MS ?? 5000),
      );

      if (!activation.success) {
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

      return {
        message: 'Provision tenant thành công',
        data: {
          tenant: activation.tenant,
          envFile: envFilePath,
          composeProjectName: resolved.composeProjectName,
          rocketUrl: resolved.rocketUrl,
        },
      };
    } catch (error) {
      await this.prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          deployStatus: 'FAILED',
          deployError: this.getErrorMessage(error),
        },
      });

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

  async loginTenant(dto: LoginTenantDto) {
    const tenant = await this.findTenantByIdentifier(
      this.cleanString(dto.tenantId),
      this.cleanString(dto.composeProjectName),
    );

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

  async deployTenantApp(dto: DeployAppDto) {
    const tenantRef = await this.findTenantByIdentifier(
      this.cleanString(dto.tenantId),
      this.cleanString(dto.composeProjectName),
    );

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantRef.id },
      select: {
        id: true,
        composeProjectName: true,
        rocketUrl: true,
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
    const deployResult = await this.runRcAppsDeploy(
      appEngineDir,
      tenant.rocketUrl,
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

  async deprovisionTenant(dto: DeprovisionTenantDto) {
    const tenant = await this.findTenantByIdentifier(
      this.cleanString(dto.tenantId),
      this.cleanString(dto.composeProjectName),
    );

    const composeDir = this.resolveComposeDir();
    const resolvedComposeProjectName = String(tenant.composeProjectName);
    await this.runComposeDown(composeDir, resolvedComposeProjectName);

    await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deployStatus: 'PENDING',
        deployError: 'Tenant đã bị xoá mềm',
      },
    });

    return {
      message: 'Deprovision tenant thành công',
      data: {
        tenantId: tenant.id,
        composeProjectName: resolvedComposeProjectName,
      },
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
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const healthy = await this.checkRocketHealth(tenant.rocketUrl);
        if (!healthy) {
          throw new Error('Rocket.Chat health check chưa pass');
        }

        const login = await this.rocketChatService.loginWithCredentials(
          tenant.rocketUrl,
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

        return {
          success: true,
          tenant: updatedTenant,
        };
      } catch (error) {
        lastError = this.getErrorMessage(error);
        if (attempt < maxAttempts) {
          await this.sleep(delayMs);
        }
      }
    }

    await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        deployStatus: 'DEPLOYING',
        deployError: lastError,
      },
    });

    return {
      success: false,
      reason: lastError,
    };
  }

  private async checkRocketHealth(rocketUrl: string): Promise<boolean> {
    try {
      const res = await axios.get(`${rocketUrl}/api/info`, {
        timeout: 4000,
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
    const traefikProtocol =
      this.cleanString(dto.traefikProtocol) ?? defaults.traefikProtocol;
    const traefikHttpPort =
      dto.traefikHttpPort ??
      (await this.allocatePort(
        'traefikHttpPort',
        defaults.traefikHttpPort,
        8082,
      ));
    const traefikDashboardPort =
      dto.traefikDashboardPort ??
      (await this.allocatePort(
        'traefikDashboardPort',
        defaults.traefikDashboardPort,
        8081,
      ));
    const traefikHttpsPort =
      dto.traefikHttpsPort ??
      (await this.allocatePort(
        'traefikHttpsPort',
        defaults.traefikHttpsPort,
        8443,
      ));

    const rootUrl =
      this.cleanString(dto.rootUrl) ??
      this.buildRootUrl(domain, traefikProtocol, traefikHttpPort);

    const hostPort =
      dto.hostPort ??
      (await this.allocatePort('hostPort', defaults.hostPort, 3000));
    const metricsPort =
      dto.metricsPort ??
      (await this.allocatePort('metricsPort', defaults.metricsPort, 9458));
    const prometheusPort =
      dto.prometheusPort ??
      (await this.allocatePort(
        'prometheusPort',
        defaults.prometheusPort,
        9000,
      ));
    const grafanaHostPort =
      dto.grafanaHostPort ??
      (await this.allocatePort(
        'grafanaHostPort',
        defaults.grafanaHostPort,
        5050,
      ));
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
      letsencryptEnabled: dto.letsencryptEnabled ?? defaults.letsencryptEnabled,
      letsencryptEmail:
        this.cleanString(dto.letsencryptEmail) ?? defaults.letsencryptEmail,
      traefikProtocol,
      hostPort,
      port: dto.port ?? defaults.port,
      metricsPort,
      bindIp: this.cleanString(dto.bindIp) ?? defaults.bindIp,
      adminUsername:
        this.cleanString(dto.adminUsername) ?? defaults.adminUsername,
      adminPass: this.cleanString(dto.adminPass) ?? defaults.adminPass,
      prometheusRetentionSize:
        this.cleanString(dto.prometheusRetentionSize) ??
        defaults.prometheusRetentionSize,
      prometheusRetentionTime:
        this.cleanString(dto.prometheusRetentionTime) ??
        defaults.prometheusRetentionTime,
      prometheusPort,
      grafanaDomain:
        this.cleanString(dto.grafanaDomain) ?? defaults.grafanaDomain,
      grafanaPath: this.cleanString(dto.grafanaPath) ?? defaults.grafanaPath,
      grafanaAdminPassword:
        this.cleanString(dto.grafanaAdminPassword) ??
        defaults.grafanaAdminPassword,
      grafanaHostPort,
      grafanaBindIp:
        this.cleanString(dto.grafanaBindIp) ?? defaults.grafanaBindIp,
      traefikHttpPort,
      traefikDashboardPort,
      traefikHttpsPort,
      mongodbBindIp:
        this.cleanString(dto.mongodbBindIp) ?? defaults.mongodbBindIp,
      mongodbPortNumber: dto.mongodbPortNumber ?? defaults.mongodbPortNumber,
      mongodbHostPortNumber,
      mongodbHostPath:
        this.cleanString(dto.mongodbHostPath) ?? defaults.mongodbHostPath,
      natsPortNumber,
      natsBindIp: this.cleanString(dto.natsBindIp) ?? defaults.natsBindIp,
      envRaw: JSON.parse(JSON.stringify(dto)) as Prisma.InputJsonValue,
    };
  }

  private async buildDefaults(): Promise<TenantDefaults> {
    const existingTenants = await this.prisma.tenant.findMany({
      select: {
        traefikHttpPort: true,
      },
    });

    const hasPort80 = existingTenants.some((t) => t.traefikHttpPort === 80);

    return {
      release: '8.0.1',
      regToken: '',
      letsencryptEnabled: false,
      letsencryptEmail: 'demo@email.com',
      traefikProtocol: 'http',
      hostPort: 3000,
      port: 3000,
      metricsPort: 9458,
      bindIp: '0.0.0.0',
      adminUsername: 'admin',
      adminPass: 'admin123',
      prometheusRetentionSize: '15GB',
      prometheusRetentionTime: '15d',
      prometheusPort: 9000,
      grafanaDomain: '',
      grafanaPath: '/grafana',
      grafanaAdminPassword: 'rc-admin',
      grafanaHostPort: 5050,
      grafanaBindIp: '127.0.0.1',
      traefikHttpPort: hasPort80 ? 8082 : 80,
      traefikDashboardPort: hasPort80 ? 8081 : 8080,
      traefikHttpsPort: hasPort80 ? 8443 : 443,
      mongodbBindIp: '127.0.0.1',
      mongodbPortNumber: 27017,
      mongodbHostPortNumber: 27017,
      mongodbHostPath: '',
      natsPortNumber: 4222,
      natsBindIp: '127.0.0.1',
    };
  }

  private async allocatePort(
    field:
      | 'hostPort'
      | 'metricsPort'
      | 'prometheusPort'
      | 'grafanaHostPort'
      | 'traefikHttpPort'
      | 'traefikDashboardPort'
      | 'traefikHttpsPort'
      | 'mongodbHostPortNumber'
      | 'natsPortNumber',
    fallback: number,
    base: number,
  ): Promise<number> {
    const tenants = await this.prisma.tenant.findMany({
      select: {
        hostPort: true,
        metricsPort: true,
        prometheusPort: true,
        grafanaHostPort: true,
        traefikHttpPort: true,
        traefikDashboardPort: true,
        traefikHttpsPort: true,
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
    const baseArgs = ['-p', composeProjectName, 'down', '-v'];
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
    domain: string;
    rootUrl: string;
    release: string;
    letsencryptEnabled: boolean;
    letsencryptEmail: string;
    traefikProtocol: string;
    composeProjectName: string;
    hostPort: number;
    port: number;
    metricsPort: number;
    bindIp: string;
    adminUsername: string;
    adminPass: string;
    prometheusRetentionSize: string;
    prometheusRetentionTime: string;
    prometheusPort: number;
    grafanaDomain: string;
    grafanaPath: string;
    grafanaAdminPassword: string;
    grafanaHostPort: number;
    grafanaBindIp: string;
    traefikHttpPort: number;
    traefikDashboardPort: number;
    traefikHttpsPort: number;
    mongodbBindIp: string;
    mongodbPortNumber: number;
    mongodbHostPortNumber: number;
    mongodbHostPath: string;
    natsPortNumber: number;
    natsBindIp: string;
  }): string {
    return [
      '#!/bin/sh',
      `REG_TOKEN=${input.regToken}`,
      `DOMAIN=${input.domain}`,
      `ROOT_URL=${input.rootUrl}`,
      `RELEASE=${input.release}`,
      `LETSENCRYPT_ENABLED=${input.letsencryptEnabled}`,
      `LETSENCRYPT_EMAIL=${input.letsencryptEmail}`,
      `TRAEFIK_PROTOCOL=${input.traefikProtocol}`,
      `COMPOSE_PROJECT_NAME=${input.composeProjectName}`,
      `HOST_PORT=${input.hostPort}`,
      `PORT=${input.port}`,
      `METRICS_PORT=${input.metricsPort}`,
      `BIND_IP=${input.bindIp}`,
      `ADMIN_USERNAME=${input.adminUsername}`,
      `ADMIN_PASS=${input.adminPass}`,
      `PROMETHEUS_RETENTION_SIZE=${input.prometheusRetentionSize}`,
      `PROMETHEUS_RETENTION_TIME=${input.prometheusRetentionTime}`,
      `PROMETHEUS_PORT=${input.prometheusPort}`,
      `GRAFANA_DOMAIN=${input.grafanaDomain}`,
      `GRAFANA_PATH=${input.grafanaPath}`,
      `GRAFANA_ADMIN_PASSWORD=${input.grafanaAdminPassword}`,
      `GRAFANA_HOST_PORT=${input.grafanaHostPort}`,
      `GRAFANA_BIND_IP=${input.grafanaBindIp}`,
      `TRAEFIK_HTTP_PORT=${input.traefikHttpPort}`,
      `TRAEFIK_DASHBOARD_PORT=${input.traefikDashboardPort}`,
      `TRAEFIK_HTTPS_PORT=${input.traefikHttpsPort}`,
      `MONGODB_BIND_IP=${input.mongodbBindIp}`,
      `MONGODB_PORT_NUMBER=${input.mongodbPortNumber}`,
      `MONGODB_HOST_PORT_NUMBER=${input.mongodbHostPortNumber}`,
      `MONGODB_HOST_PATH=${input.mongodbHostPath}`,
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

  async getTenantsList(query: QueryTenantsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const skip = (page - 1) * pageSize;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';
    const isDeleted = query.isDeleted ?? false;

    // Build where clause
    interface TenantWhere {
      isDeleted: boolean;
      OR?: any[];
      deployStatus?: any;
    }
    const where: TenantWhere = {
      isDeleted,
    };

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

  private buildRootUrl(
    domain: string,
    protocol: string,
    traefikHttpPort: number,
  ): string {
    const safeProtocol = protocol.toLowerCase() === 'https' ? 'https' : 'http';

    if (
      (safeProtocol === 'http' && traefikHttpPort === 80) ||
      (safeProtocol === 'https' && traefikHttpPort === 443)
    ) {
      return `${safeProtocol}://${domain}`;
    }

    return `${safeProtocol}://${domain}:${traefikHttpPort}`;
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
}
