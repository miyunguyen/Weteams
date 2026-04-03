/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { HttpStatus, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AppException } from 'src/common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { RocketChatService } from '../rocketChat/rocketChat.service';
import { CreateFromRoomDto } from './dto/create-from-room.dto';
import { CreateTeamWithChannelsDto } from './dto/create-team-with-channels.dto';
import { DeleteTeamDto } from './dto/delete-team.dto';
import { JoinTeamDto } from './dto/join-team.dto';
import { LeaveTeamDto } from './dto/leave-team.dto';

@Injectable()
export class TeamService {
  private static readonly MAX_RETRY = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rocketChat: RocketChatService,
  ) {}

  generateJoinCode() {
    return randomBytes(3).toString('hex').toUpperCase();
  }

  async createTeamWithChannels(dto: CreateTeamWithChannelsDto) {
    const tenantId = dto.tenantId;
    const roomName = dto.roomName.trim();
    const channelsName = dto.channelsName ?? [];

    if (!roomName) {
      throw new AppException(HttpStatus.BAD_REQUEST, {
        message: 'roomName không hợp lệ',
        errorCode: 'TEAM_NAME_REQUIRED',
        data: null,
      });
    }

    const teamResponse = await this.rocketChat.createTeam(
      tenantId,
      roomName,
      1,
    );
    const teamData = teamResponse?.data;
    const rocketTeamId = teamData?.team?._id ?? teamData?.team?.id;

    if (!teamData?.success || !rocketTeamId) {
      throw new AppException(HttpStatus.BAD_REQUEST, {
        message: 'Tạo team trên Rocket.Chat thất bại',
        errorCode: 'ROCKET_CREATE_TEAM_FAILED',
        data: teamData ?? null,
      });
    }

    const createdTeam = await this.prisma.team.create({
      data: {
        tenantId,
        roomId: String(teamData?.team?.roomId ?? rocketTeamId),
        name: roomName,
        joinCode: this.generateJoinCode(),
        teamId: String(rocketTeamId),
      },
    });

    const createGroup = async (channelName: string): Promise<any> => {
      return this.rocketChat.createGroup(
        tenantId,
        channelName,
        String(rocketTeamId),
      );
    };

    const createdChannels: Array<{
      inputName: string;
      name: string;
      rocketResponse: unknown;
    }> = [];

    for (const rawChannelName of channelsName) {
      const suffix = this.normalizeChannelSuffix(rawChannelName);
      if (!suffix) {
        continue;
      }

      const childName = this.buildChildChannelName(roomName, suffix);
      const groupResponse = await createGroup(childName);
      const groupData = groupResponse?.data;

      if (!groupData?.success) {
        throw new AppException(HttpStatus.BAD_REQUEST, {
          message: `Tạo group ${childName} thất bại`,
          errorCode: 'ROCKET_CREATE_GROUP_FAILED',
          data: groupData ?? null,
        });
      }

      createdChannels.push({
        inputName: rawChannelName,
        name: childName,
        rocketResponse: groupData,
      });
    }

    return {
      message: 'Tạo team kèm channels thành công',
      data: {
        team: createdTeam,
        channels: createdChannels,
      },
    };
  }

  async createFromRoom(dto: CreateFromRoomDto) {
    const { tenantId, roomId, roomName } = dto;

    const team = await this.rocketChat.isTeam(tenantId, roomId);

    if (!team) {
      return {
        message: 'Room không phải là team',
        data: { skipped: true, reason: 'NOT_A_TEAM' },
      };
    }

    const existing = await this.prisma.team.findFirst({
      where: { tenantId, teamId: team._id },
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
        if (err.code === 'P2002') {
          continue;
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

    await this.rocketChat.addMemberToTeam(tenantId, team.teamId, rocketUserId);

    await this.prisma.teamMember.create({
      data: {
        teamId: team.id,
        userId: user.id,
      },
    });

    return {
      message: 'Join team thành công',
      data: {
        teamId: team.id,
        userId: user.id,
      },
    };
  }

  async handleDeleteTeam(dto: DeleteTeamDto) {
    const { tenantId, roomId } = dto;

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

    const deletedTeam = await this.prisma.team.deleteMany({
      where: {
        teamId: team.id,
        tenantId: tenantId,
      },
    });

    return {
      message: 'Xoá team thành công',
      data: {
        removed: deletedTeam.count > 0,
        deletedCount: deletedTeam.count,
        teamId: team.id,
      },
    };
  }

  async handleUserLeave(dto: LeaveTeamDto) {
    const { tenantId, roomId, rocketUserId } = dto;

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

  private normalizeChannelSuffix(value: string): string {
    return value
      .trim()
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private buildChildChannelName(
    parentName: string,
    childSuffix: string,
  ): string {
    const normalizedParent = parentName
      .trim()
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_');

    if (childSuffix.startsWith(`${normalizedParent}_`)) {
      return childSuffix;
    }

    return `${normalizedParent}_${childSuffix}`;
  }
}
