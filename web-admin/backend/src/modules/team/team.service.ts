/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RocketChatService } from '../rocketChat/rocketChat.service';
import { randomBytes } from 'crypto';

@Injectable()
export class TeamService {
  private static readonly MAX_RETRY = 5;

  constructor(
    private prisma: PrismaService,
    private rocketChat: RocketChatService,
  ) {}

  generateJoinCode() {
    return randomBytes(3).toString('hex').toUpperCase();
  }

  async createFromRoom(dto: any) {
    const { tenantId, roomId, roomName } = dto;

    // 1. check có phải team
    const isTeam = await this.rocketChat.isTeam(tenantId, roomId);
    if (!isTeam) {
      return { skipped: true, reason: 'NOT_A_TEAM' };
    }

    // 2. check đã tồn tại
    const existing = await this.prisma.team.findFirst({
      where: { tenantId, roomId },
    });

    if (existing) {
      return { skipped: true, reason: 'ALREADY_EXISTS' };
    }

    for (let i = 0; i < TeamService.MAX_RETRY; i++) {
      const joinCode = this.generateJoinCode();

      try {
        return await this.prisma.team.create({
          data: {
            tenantId,
            roomId,
            name: roomName,
            joinCode,
          },
        });
      } catch (err) {
        // Prisma unique constraint error
        if (err.code === 'P2002') {
          continue; // retry
        }
        throw err;
      }
    }

    throw new Error('JOIN_CODE_GENERATION_FAILED');
  }
}
