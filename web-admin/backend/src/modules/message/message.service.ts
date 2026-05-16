/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RocketChatService } from '../rocketChat/rocketChat.service';
import { AppException } from '../../common/exceptions/app.exception';

@Injectable()
export class MessageService {
  constructor(
    private readonly rocketChatService: RocketChatService,
    private readonly prismaService: PrismaService,
  ) {}

  async sendTeamsMessage(tenantId: string, teamIds: string[], text: string) {
    const normalizedText = text.trim();

    if (!normalizedText) {
      throw new AppException(HttpStatus.BAD_REQUEST, {
        message: 'Nội dung tin nhắn không được để trống',
        errorCode: 'MESSAGE_TEXT_REQUIRED',
        data: null,
      });
    }

    if (!Array.isArray(teamIds) || teamIds.length === 0) {
      throw new AppException(HttpStatus.BAD_REQUEST, {
        message: 'Cần chọn ít nhất một team',
        errorCode: 'MESSAGE_TEAM_IDS_REQUIRED',
        data: null,
      });
    }

    const teams = await this.prismaService.team.findMany({
      where: {
        tenantId,
        id: {
          in: teamIds,
        },
      },
      select: {
        id: true,
        roomId: true,
        name: true,
        teamId: true,
      },
    });

    const foundTeamIds = new Set(teams.map((team) => team.id));
    const missingTeamIds = teamIds.filter(
      (teamId) => !foundTeamIds.has(teamId),
    );

    if (missingTeamIds.length > 0) {
      throw new AppException(HttpStatus.BAD_REQUEST, {
        message: 'Một hoặc nhiều team không hợp lệ',
        errorCode: 'MESSAGE_TEAM_NOT_FOUND',
        data: { missingTeamIds },
      });
    }

    const results = await Promise.allSettled(
      teams.map(async (team) => {
        const response = await this.rocketChatService.sendMessage(
          tenantId,
          team.roomId,
          normalizedText,
        );

        const responseData = response?.data;

        if (!responseData?.success) {
          throw new AppException(HttpStatus.BAD_REQUEST, {
            message: `Gửi tin nhắn tới team ${team.name ?? team.teamId} thất bại`,
            errorCode: 'SEND_TEAM_MESSAGE_FAILED',
            data: {
              teamId: team.id,
              roomId: team.roomId,
              response: responseData ?? null,
            },
          });
        }

        return {
          teamId: team.id,
          roomId: team.roomId,
        };
      }),
    );

    const failedTeams = results
      .map((result, index) => {
        if (result.status === 'fulfilled') {
          return null;
        }

        const team = teams[index];

        return {
          teamId: team.id,
          roomId: team.roomId,
          message:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        };
      })
      .filter(
        (item): item is { teamId: string; roomId: string; message: string } =>
          item !== null,
      );

    if (failedTeams.length > 0) {
      throw new AppException(HttpStatus.BAD_REQUEST, {
        message: 'Có team gửi tin nhắn thất bại',
        errorCode: 'SEND_TEAM_MESSAGE_PARTIAL_FAILURE',
        data: {
          sentCount: results.length - failedTeams.length,
          failedTeams,
        },
      });
    }

    return {
      message: 'Đã gửi tin nhắn tới các team đã chọn',
      data: {
        sentCount: results.length,
        teamIds,
      },
    };
  }

  async pinMessage(tenantId: string, messageId: string) {
    const response = await this.rocketChatService.pinMessage(
      tenantId,
      messageId,
    );
    const responseData = response?.data;

    if (!responseData?.success) {
      throw new AppException(HttpStatus.BAD_REQUEST, {
        message: 'Pin message thất bại',
        errorCode: 'PIN_MESSAGE_FAILED',
        data: responseData ?? null,
      });
    }

    return {
      message: 'Pin message thành công',
      data: {
        messageId,
      },
    };
  }
}
