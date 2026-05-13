/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { HttpStatus, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AppException } from 'src/common/exceptions/app.exception';
import { VietnameseUtil } from 'src/common/utils/vietnamese.util';
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

    try {
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

      const joinCode = this.generateJoinCode();
      const createdTeam = await this.prisma.team.create({
        data: {
          tenantId,
          roomId: String(teamData?.team?.roomId ?? rocketTeamId),
          name: roomName,
          joinCode,
          teamId: String(rocketTeamId),
        },
      });

      const joinCodeText = `Mã tham gia team: ${joinCode}`;
      const postMessageResponse = await this.rocketChat.postMessage(
        tenantId,
        createdTeam.roomId,
        joinCodeText,
      );
      const postMessageData = postMessageResponse?.data;
      const messageId: string = postMessageData?.message?._id;

      if (!postMessageData?.success || !messageId) {
        throw new AppException(HttpStatus.BAD_REQUEST, {
          message: 'Gửi message join code thất bại',
          errorCode: 'ROCKET_POST_JOIN_CODE_FAILED',
          data: postMessageData ?? null,
        });
      }

      const pinResponse = await this.rocketChat.pinMessage(tenantId, messageId);
      const pinData = pinResponse?.data;

      if (!pinData?.success) {
        throw new AppException(HttpStatus.BAD_REQUEST, {
          message: 'Pin message join code thất bại',
          errorCode: 'ROCKET_PIN_JOIN_CODE_FAILED',
          data: pinData ?? null,
        });
      }

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
        try {
          const groupResponse = await createGroup(childName);
          const groupData = groupResponse?.data;

          if (!groupData?.success) {
            const errorMsg = groupData?.error || 'Unknown error';
            throw new AppException(HttpStatus.BAD_REQUEST, {
              message: `Tạo group ${childName} thất bại: ${errorMsg}`,
              errorCode: 'ROCKET_CREATE_GROUP_FAILED',
              data: groupData ?? groupResponse,
            });
          }

          createdChannels.push({
            inputName: rawChannelName,
            name: childName,
            rocketResponse: groupData,
          });
        } catch (error) {
          // If it's already an AppException, rethrow it
          if (error instanceof AppException) {
            throw error;
          }
          // Otherwise wrap the error
          throw new AppException(HttpStatus.BAD_REQUEST, {
            message: `Lỗi khi tạo group ${childName}: ${error instanceof Error ? error.message : String(error)}`,
            errorCode: 'ROCKET_CREATE_GROUP_ERROR',
            data: { rawChannelName, childName, error: String(error) },
          });
        }
      }

      return {
        message: 'Tạo team kèm channels thành công',
        data: {
          team: createdTeam,
          joinCodeMessageId: messageId,
          channels: createdChannels,
        },
      };
    } catch (error) {
      // If it's already an AppException, rethrow it
      if (error instanceof AppException) {
        throw error;
      }
      // Log unexpected errors and wrap them
      console.error('Unexpected error in createTeamWithChannels:', error);
      throw new AppException(HttpStatus.INTERNAL_SERVER_ERROR, {
        message: `Lỗi không mong đợi khi tạo team: ${error instanceof Error ? error.message : String(error)}`,
        errorCode: 'TEAM_CREATION_UNEXPECTED_ERROR',
        data: { error: String(error) },
      });
    }
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
        if ((err as { code?: string })?.code === 'P2002') {
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

    const roomsResponse = await this.rocketChat.listTeamRooms(
      tenantId,
      team.teamId,
    );
    const roomsData = roomsResponse?.data;
    const rooms = Array.isArray(roomsData?.rooms) ? roomsData.rooms : [];

    for (const roomItem of rooms) {
      if (roomItem.t !== 'p') {
        continue;
      }

      const roomIdToKick = String(roomItem?._id ?? '').trim();

      if (!roomIdToKick) {
        continue;
      }

      const kickResponse = await this.rocketChat.kickFromGroup(
        tenantId,
        roomIdToKick,
        rocketUserId,
      );
      const kickData = kickResponse?.data;

      if (!kickData?.success) {
        throw new AppException(HttpStatus.BAD_REQUEST, {
          message: `Không thể kick user khỏi room ${roomIdToKick}`,
          errorCode: 'ROCKET_GROUP_KICK_FAILED',
          data: kickData ?? null,
        });
      }
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

  private transliterateVietnamese(text: string): string {
    return VietnameseUtil.transliterate(text);
  }

  private normalizeChannelSuffix(value: string): string {
    return this.transliterateVietnamese(value)
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^\w-]/g, '')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
  }

  private buildChildChannelName(
    parentName: string,
    childSuffix: string,
  ): string {
    const normalizedParent = this.transliterateVietnamese(parentName)
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^\w-]/g, '')
      .replace(/_+/g, '_')
      .toLowerCase();

    const normalizedChild = childSuffix.toLowerCase();

    if (normalizedChild.startsWith(`${normalizedParent}_`)) {
      return normalizedChild;
    }

    return `${normalizedParent}_${normalizedChild}`;
  }

  async searchTeams(dto: {
    tenantId: string;
    page?: number;
    pageSize?: number;
    keyword?: string;
  }) {
    const page = this.toPositiveInt(dto.page, 1);
    const pageSize = this.toPositiveInt(dto.pageSize, 20);
    const skip = (page - 1) * pageSize;

    const where: any = { tenantId: dto.tenantId };

    if (dto.keyword) {
      where.OR = [
        { name: { contains: dto.keyword, mode: 'insensitive' } },
        { roomId: { contains: dto.keyword, mode: 'insensitive' } },
        { teamId: { contains: dto.keyword, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.team.findMany({
        where,
        select: {
          id: true,
          tenantId: true,
          roomId: true,
          name: true,
          joinCode: true,
          teamId: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.team.count({ where }),
    ]);

    const teamIds = items.map((team) => team.id);
    const memberCounts = teamIds.length
      ? await this.prisma.teamMember.groupBy({
          by: ['teamId'],
          where: { teamId: { in: teamIds } },
          _count: { _all: true },
        })
      : [];

    const memberCountMap = new Map<string, number>(
      memberCounts.map((item) => [item.teamId, item._count._all]),
    );

    const normalizedItems = items.map((team) => ({
      ...team,
      memberCount: memberCountMap.get(team.id) ?? 0,
    }));

    return {
      message: 'Lấy danh sách team thành công',
      data: {
        items: normalizedItems,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    };
  }

  async listTeamMembers(teamId: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;

    const where = { teamId };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.teamMember.findMany({
        where,
        orderBy: { joinedAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          user: {
            select: {
              id: true,
              tenantId: true,
              rocketUserId: true,
              username: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
      }),
      this.prisma.teamMember.count({ where }),
    ]);

    return {
      message: 'Lấy danh sách thành viên team thành công',
      data: {
        items,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    };
  }

  async syncTeamMembershipsForUser(tenantId: string, rocketUserId: string) {
    const res = await this.rocketChat.listUserTeams(tenantId, rocketUserId);

    const data = res?.data;

    const teams = Array.isArray(data?.teams) ? data.teams : [];

    const results: Array<any> = [];

    // find local user
    const user = await this.prisma.user.findFirst({
      where: { tenantId, rocketUserId },
    });
    if (!user) {
      return { message: 'User not found locally', data: null };
    }

    for (const t of teams) {
      const rocketTeamId = String(t._id ?? '');

      const roomId = String(t.roomId ?? '');

      const name = String(t.name ?? '') || rocketTeamId;

      let localTeam = await this.prisma.team.findFirst({
        where: { tenantId, OR: [{ teamId: rocketTeamId }, { roomId }] },
      });

      if (!localTeam) {
        // create minimal team record
        localTeam = await this.prisma.team.create({
          data: {
            tenantId,
            roomId: roomId || rocketTeamId,
            name,
            joinCode: this.generateJoinCode(),
            teamId: rocketTeamId,
          },
        });
      }

      // create membership if not exists
      const existing = await this.prisma.teamMember.findFirst({
        where: { teamId: localTeam.id, userId: user.id },
      });
      if (!existing) {
        await this.prisma.teamMember.create({
          data: { teamId: localTeam.id, userId: user.id },
        });

        results.push({ team: localTeam, created: true });
      } else {
        results.push({ team: localTeam, created: false });
      }
    }

    return { message: 'Đồng bộ team memberships hoàn tất', data: results };
  }

  async syncAllTeamMembershipsForTenant(tenantId: string) {
    const users = await this.prisma.user.findMany({ where: { tenantId } });

    const results: Array<any> = [];

    for (const user of users) {
      if (!user.rocketUserId) continue;
      try {
        await this.syncTeamMembershipsForUser(tenantId, user.rocketUserId);

        results.push({ userId: user.id, status: 'success' });
      } catch (e) {
        results.push({ userId: user.id, status: 'failed', reason: String(e) });
      }
    }

    return {
      message: 'Đồng bộ tất cả team memberships hoàn tất',
      data: { syncedCount: results.length, details: results },
    };
  }

  private toPositiveInt(value: unknown, fallback: number): number {
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
