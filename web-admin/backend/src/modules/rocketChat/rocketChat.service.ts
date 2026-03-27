/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import 'dotenv/config';

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

  async refreshToken(tenantId: string) {
    const tenant = await this.getTenant(tenantId);

    const res = await axios.post(`${tenant!.rocketUrl}/api/v1/login`, {
      user: process.env.ROCKET_ADMIN_USERNAME,
      password: process.env.ROCKET_ADMIN_PASSWORD,
    });

    const { authToken, userId } = res.data.data;

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

    try {
      return await fn(this.getHeaders(tenant), tenant);
    } catch (err) {
      if (err?.response?.status === 401) {
        const newTenant = await this.refreshToken(tenantId);
        return fn(this.getHeaders(newTenant), newTenant);
      }
      throw err;
    }
  }

  // ===== BUSINESS API =====

  async isTeam(tenantId: string, roomId: string): Promise<boolean> {
    const res = await this.callApi(tenantId, (headers, tenant) =>
      axios.get(`${tenant.rocketUrl}/api/v1/rooms.info?roomId=${roomId}`, {
        headers,
      }),
    );

    const data = res.data;

    return !!data?.team; // key logic
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

  async setOwner(tenantId: string, roomId: string, userId: string) {
    return this.callApi(tenantId, (headers, tenant) =>
      axios.post(
        `${tenant.rocketUrl}/api/v1/channels.setOwner`,
        { roomId, userId },
        { headers },
      ),
    );
  }
}
