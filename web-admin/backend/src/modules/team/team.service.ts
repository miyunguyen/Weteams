/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { BadRequestException, Injectable } from '@nestjs/common';
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
    const team = await this.rocketChat.isTeam(tenantId, roomId);

    if (!team) {
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
            teamId: team._id,
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

  async joinByCode(dto: any) {
    const { tenantId, joinCode, rocketUserId, rocketUsername } = dto;

    // 1. tìm team
    const team = await this.prisma.team.findFirst({
      where: {
        tenantId,
        joinCode,
      },
    });

    if (!team) {
      throw new BadRequestException({
        message: 'Join code không hợp lệ',
        errorCode: 'INVALID_CODE',
        data: null,
      });
    }

    // 2. find or create user
    let user = await this.prisma.user.findFirst({
      where: {
        tenantId,
        rocketUserId,
      },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          tenantId,
          rocketUserId,
          username: rocketUsername,
          email: `${rocketUserId}@local.dev`,
        },
      });
    }

    // 3. check đã join chưa
    const existing = await this.prisma.teamMember.findFirst({
      where: {
        teamId: team.id,
        userId: user.id,
      },
    });

    if (existing) {
      return {
        message: 'Người dùng đã tham gia team',
        data: {
          alreadyJoined: true,
          teamId: team.id,
          userId: user.id,
        },
      };
    }

    // 4. add vào Rocket chat team
    await this.rocketChat.addMemberToTeam(tenantId, team.teamId, rocketUserId);

    // 5. insert DB
    await this.prisma.teamMember.create({
      data: {
        teamId: team.id,
        userId: user.id,
        role: 'STUDENT',
      },
    });

    return {
      message: 'Join team thành công',
      data: {
        teamId: team.id,
        userId: user.id,
        role: 'STUDENT',
      },
    };
  }
}
