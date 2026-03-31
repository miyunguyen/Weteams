/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RocketChatService } from '../rocketChat/rocketChat.service';
import { randomBytes } from 'crypto';
import { LeaveTeamDto } from './dto/leave-team.dto';
import { JoinTeamDto } from './dto/join-team.dto';
import { CreateFromRoomDto } from './dto/create-from-room.dto';
import { AppException } from 'src/common/exceptions/app.exception';

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

  async createFromRoom(dto: CreateFromRoomDto) {
    const { tenantId, roomId, roomName } = dto;

    // 1. check có phải team
    const team = await this.rocketChat.isTeam(tenantId, roomId);

    if (!team) {
      return {
        message: 'Room không phải là team',
        data: { skipped: true, reason: 'NOT_A_TEAM' },
      };
    }

    // 2. check đã tồn tại
    const existing = await this.prisma.team.findFirst({
      where: { tenantId, roomId },
    });

    if (existing) {
      return {
        message: 'Team đã tồn tại',
        data: { skipped: true, reason: 'ALREADY_EXISTS' },
      };
    }

    for (let i = 0; i < TeamService.MAX_RETRY; i++) {
      const joinCode = this.generateJoinCode();

      try {
        const createdTeam = await this.prisma.team.create({
          data: {
            tenantId,
            roomId,
            name: roomName,
            joinCode,
            teamId: team._id,
          },
        });

        return {
          message: 'Tạo team thành công',
          data: createdTeam,
        };
      } catch (err) {
        // Prisma unique constraint error
        if (err.code === 'P2002') {
          continue; // retry
        }
        throw err;
      }
    }

    throw new AppException(HttpStatus.INTERNAL_SERVER_ERROR, {
      message: 'Không thể tạo join code cho team',
      errorCode: 'JOIN_CODE_GENERATION_FAILED',
      data: null,
    });
  }

  async joinByCode(dto: JoinTeamDto) {
    const { tenantId, joinCode, rocketUserId, rocketUsername } = dto;

    // 1. tìm team
    const team = await this.prisma.team.findFirst({
      where: {
        tenantId,
        joinCode,
      },
    });

    if (!team) {
      throw new AppException(HttpStatus.BAD_REQUEST, {
        message: 'Không tìm thấy join code hợp lệ',
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
        role: 'STUDENT', // tạm thời mặc định student
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

  async handleUserLeave(dto: LeaveTeamDto) {
    const { tenantId, roomId, rocketUserId } = dto;

    // 1. tìm team theo roomId
    const team = await this.prisma.team.findFirst({
      where: {
        tenantId,
        roomId,
      },
    });

    if (!team) {
      return {
        message: 'Team không tồn tại',
        data: { removed: false, reason: 'TEAM_NOT_FOUND' },
      };
    }

    // 2. tìm user
    const user = await this.prisma.user.findFirst({
      where: {
        tenantId,
        rocketUserId,
      },
    });

    if (!user) {
      return {
        message: 'Người dùng không tồn tại',
        data: { removed: false, reason: 'USER_NOT_FOUND' },
      };
    }

    // 3. xoá membership
    const deletedMembership = await this.prisma.teamMember.deleteMany({
      where: {
        teamId: team.id,
        userId: user.id,
      },
    });

    return {
      message: 'Rời team thành công',
      data: {
        removed: deletedMembership.count > 0,
        deletedCount: deletedMembership.count,
        teamId: team.id,
        userId: user.id,
      },
    };
  }
}
