/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { HttpStatus, Injectable } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import 'dotenv/config';
import { AppException } from '../../common/exceptions/app.exception';

@Injectable()
export class RocketChatService {
  constructor(private prisma: PrismaService) {}

  async getTenant(tenantId: string) {
    return this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
  }

  getHeaders(tenant) {
    return {
      'X-Auth-Token': tenant.adminAuthToken,
      'X-User-Id': tenant.adminUserId,
    };
  }

  async loginWithCredentials(
    rocketUrl: string,
    username: string,
    password: string,
  ): Promise<{ authToken: string; userId: string }> {
    const res = await axios.post(
      `${rocketUrl}/api/v1/login`,
      {
        user: username,
        password,
      },
      {
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 300,
      },
    );

    const authToken = res?.data?.data?.authToken;
    const userId = res?.data?.data?.userId;

    if (!authToken || !userId) {
      throw new AppException(HttpStatus.BAD_REQUEST, {
        message: 'Rocket.Chat login response không hợp lệ',
        errorCode: 'ROCKET_LOGIN_INVALID_RESPONSE',
        data: res?.data ?? null,
      });
    }

    return { authToken, userId };
  }

  async refreshToken(tenantId: string) {
    const tenant = await this.getTenant(tenantId);

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

    const { authToken, userId } = await this.loginWithCredentials(
      tenant.rocketUrl,
      String(tenant.adminUsername),
      String(tenant.adminPass),
    );

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        adminAuthToken: authToken,
        adminUserId: userId,
      },
    });

    return { ...tenant, adminAuthToken: authToken, adminUserId: userId };
  }

  async callApi(tenantId: string, fn: (headers, tenant) => Promise<any>) {
    const tenant = await this.getTenant(tenantId);

    if (!tenant) {
      throw new AppException(HttpStatus.NOT_FOUND, {
        message: 'Không tìm thấy tenant',
        errorCode: 'TENANT_NOT_FOUND',
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

    try {
      return await fn(this.getHeaders(tenant), tenant);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status === 401) {
        const newTenant = await this.refreshToken(tenantId);
        return fn(this.getHeaders(newTenant), newTenant);
      }
      throw err;
    }
  }

  // ===== BUSINESS API =====

  async isTeam(tenantId: string, roomId: string): Promise<any> {
    const res = await this.callApi(tenantId, (headers, tenant) =>
      axios.get(`${tenant.rocketUrl}/api/v1/rooms.info?roomId=${roomId}`, {
        headers,
      }),
    );

    const data = res.data;

    return data?.team;
  }

  async createTeam(tenantId: string, name: string, type: number) {
    return this.callApi(tenantId, (headers, tenant) =>
      axios.post(
        `${tenant.rocketUrl}/api/v1/teams.create`,
        { name, type },
        { headers },
      ),
    );
  }

  async createChannel(tenantId: string, name: string) {
    return this.callApi(tenantId, (headers, tenant) =>
      axios.post(
        `${tenant.rocketUrl}/api/v1/channels.create`,
        { name },
        { headers },
      ),
    );
  }

  async inviteUser(tenantId: string, roomId: string, userId: string) {
    return this.callApi(tenantId, (headers, tenant) =>
      axios.post(
        `${tenant.rocketUrl}/api/v1/channels.invite`,
        { roomId, userId },
        { headers },
      ),
    );
  }

  async addMemberToTeam(
    tenantId: string,
    teamId: string,
    userId: string,
    role?: string,
  ) {
    const members = [
      {
        userId: userId,
        roles: [role ?? 'member'],
      },
    ];
    return this.callApi(tenantId, (headers, tenant) =>
      axios.post(
        `${tenant.rocketUrl}/api/v1/teams.addMembers`,
        { teamId, members },
        { headers },
      ),
    );
  }

  async setOwner(tenantId: string, roomId: string, userId: string) {
    return this.callApi(tenantId, (headers, tenant) =>
      axios.post(
        `${tenant.rocketUrl}/api/v1/channels.setOwner`,
        { roomId, userId },
        { headers },
      ),
    );
  }

  async pinMessage(tenantId: string, messageId: string) {
    return this.callApi(tenantId, (headers, tenant) =>
      axios.post(
        `${tenant.rocketUrl}/api/v1/chat.pinMessage`,
        { messageId },
        { headers },
      ),
    );
  }

  async postMessage(tenantId: string, roomId: string, text: string) {
    return this.callApi(tenantId, (headers, tenant) =>
      axios.post(
        `${tenant.rocketUrl}/api/v1/chat.postMessage`,
        {
          roomId,
          text,
        },
        { headers },
      ),
    );
  }

  async listTeamRooms(tenantId: string, teamId: string) {
    return this.callApi(tenantId, (headers, tenant) =>
      axios.get(`${tenant.rocketUrl}/api/v1/teams.listRooms?teamId=${teamId}`, {
        headers,
      }),
    );
  }

  async kickFromGroup(tenantId: string, roomId: string, userId: string) {
    return this.callApi(tenantId, (headers, tenant) =>
      axios.post(
        `${tenant.rocketUrl}/api/v1/groups.kick`,
        {
          roomId,
          userId,
        },
        { headers },
      ),
    );
  }

  async createUser(
    tenantId: string,
    payload: {
      name: string;
      email: string;
      password: string;
      username: string;
    },
  ) {
    return this.callApi(tenantId, (headers, tenant) =>
      axios.post(`${tenant.rocketUrl}/api/v1/users.create`, payload, {
        headers,
      }),
    );
  }

  async createGroup(tenantId: string, name: string, teamId: string) {
    return this.callApi(tenantId, (headers, tenant) =>
      axios.post(
        `${tenant.rocketUrl}/api/v1/groups.create`,
        {
          name,
          extraData: {
            teamId,
            teamDefault: true,
          },
        },
        { headers },
      ),
    );
  }

  async deleteUser(tenantId: string, rocketUserId: string) {
    return this.callApi(tenantId, (headers, tenant) =>
      axios.post(
        `${tenant.rocketUrl}/api/v1/users.delete`,
        {
          userId: rocketUserId,
          confirmRelinquish: true,
        },
        { headers },
      ),
    );
  }
}
