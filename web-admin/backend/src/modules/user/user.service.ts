/* eslint-disable @typescript-eslint/no-base-to-string */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { HttpStatus, Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { RocketChatService } from '../rocketChat/rocketChat.service';
import { AppException } from '../../common/exceptions/app.exception';
import { CreateUserDto, UserRoleDto } from './dto/create-user.dto';
import { ImportUsersDto } from './dto/import-users.dto';
import { SearchUserDto } from './dto/search-user.dto';
import { FromAppUserDto } from './dto/from-app-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import type { Prisma } from 'src/generated/prisma/client';

@Injectable()
export class UserService {
  private readonly searchableStringFields = [
    'id',
    'rocketUserId',
    'username',
    'name',
    'email',
    'address',
    'citizenId',
    'phoneNumber',
    'avatarUrl',
  ] as const;

  private readonly exactFields = ['role'] as const;

  private readonly dateFields = [
    'dateOfBirth',
    'createdAt',
    'updatedAt',
  ] as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rocketChatService: RocketChatService,
  ) {}

  async createUser(dto: CreateUserDto) {
    const { tenantId, name, email, password, username } = dto;

    const existingByUsername = await this.prisma.user.findFirst({
      where: {
        tenantId,
        username,
      },
    });

    if (existingByUsername) {
      throw new AppException(HttpStatus.CONFLICT, {
        message: 'Username đã tồn tại trong tenant',
        errorCode: 'USER_USERNAME_EXISTS',
        data: {
          tenantId,
          username,
        },
      });
    }

    const existingByEmail = await this.prisma.user.findFirst({
      where: {
        tenantId,
        email,
      },
    });

    if (existingByEmail) {
      throw new AppException(HttpStatus.CONFLICT, {
        message: 'Email đã tồn tại trong tenant',
        errorCode: 'USER_EMAIL_EXISTS',
        data: {
          tenantId,
          email,
        },
      });
    }

    const rocketRes = await this.rocketChatService.createUser(tenantId, {
      name,
      email,
      password,
      username,
    });

    const rocketData = rocketRes?.data;
    const rocketUserId = rocketData?.user?._id as string | undefined;

    if (!rocketData?.success || !rocketUserId) {
      throw new AppException(HttpStatus.BAD_REQUEST, {
        message: 'Tạo user trên Rocket.Chat thất bại',
        errorCode: 'ROCKET_CREATE_USER_FAILED',
        data: rocketData ?? null,
      });
    }

    const created = await this.prisma.user.create({
      data: {
        tenantId,
        rocketUserId,
        username,
        name,
        email,
        role: dto.role,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        address: dto.address,
        citizenId: dto.citizenId,
        phoneNumber: dto.phoneNumber,
        avatarUrl: dto.avatarUrl,
      },
    });

    return {
      message: 'Tạo user thành công',
      data: created,
    };
  }

  async importUsers(dto: ImportUsersDto, file?: { buffer: Buffer }) {
    if (!file?.buffer) {
      throw new AppException(HttpStatus.BAD_REQUEST, {
        message: 'Thiếu file excel',
        errorCode: 'EXCEL_FILE_REQUIRED',
        data: null,
      });
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      throw new AppException(HttpStatus.BAD_REQUEST, {
        message: 'File excel không có sheet',
        errorCode: 'EXCEL_SHEET_NOT_FOUND',
        data: null,
      });
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
    });

    const created: unknown[] = [];
    const failed: Array<{ row: number; reason: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const rowNumber = i + 2;
      const row = rows[i];

      const rawName = String(row.name ?? row.Name ?? '').trim();
      const rawEmail = String(row.email ?? row.Email ?? '').trim();
      const rawPassword = String(row.password ?? row.Password ?? '').trim();
      const rawUsername = String(row.username ?? row.Username ?? '').trim();

      if (!rawName || !rawEmail || !rawPassword || !rawUsername) {
        failed.push({
          row: rowNumber,
          reason: 'Thiếu trường bắt buộc: name/email/password/username',
        });
        continue;
      }

      const roleCandidate = String(row.role ?? row.Role ?? '').trim();
      const role =
        roleCandidate && roleCandidate in UserRoleDto
          ? (roleCandidate as UserRoleDto)
          : undefined;

      try {
        const item = await this.createUser({
          tenantId: dto.tenantId,
          name: rawName,
          email: rawEmail,
          password: rawPassword,
          username: rawUsername,
          role,
          dateOfBirth: this.cleanOptionalString(
            String(row.dateOfBirth ?? row.DateOfBirth ?? '').trim(),
          ),
          address: this.cleanOptionalString(
            String(row.address ?? row.Address ?? '').trim(),
          ),
          citizenId: this.cleanOptionalString(
            String(row.citizenId ?? row.CitizenId ?? '').trim(),
          ),
          phoneNumber: this.cleanOptionalString(
            String(row.phoneNumber ?? row.PhoneNumber ?? '').trim(),
          ),
          avatarUrl: this.cleanOptionalString(
            String(row.avatarUrl ?? row.AvatarUrl ?? '').trim(),
          ),
        });

        created.push(item.data);
      } catch (error) {
        failed.push({
          row: rowNumber,
          reason: this.getErrorMessage(error),
        });
      }
    }

    return {
      message: 'Import user hoàn tất',
      data: {
        total: rows.length,
        createdCount: created.length,
        failedCount: failed.length,
        created,
        failed,
      },
    };
  }

  async searchUsers(dto: SearchUserDto) {
    const page = this.toNumber(dto.page, 1);
    const pageSize = this.toNumber(dto.pageSize, 20);
    const skip = (page - 1) * pageSize;
    const andFilters: Prisma.UserWhereInput[] = [];

    const where: Prisma.UserWhereInput = { tenantId: dto.tenantId };

    if (dto.keyword) {
      andFilters.push({
        OR: [
          { name: { contains: dto.keyword, mode: 'insensitive' } },
          { username: { contains: dto.keyword, mode: 'insensitive' } },
          { email: { contains: dto.keyword, mode: 'insensitive' } },
          { citizenId: { contains: dto.keyword, mode: 'insensitive' } },
          { phoneNumber: { contains: dto.keyword, mode: 'insensitive' } },
        ],
      });
    }

    const filters = dto.filters ?? dto.data ?? {};
    for (const [key, rawValue] of Object.entries(filters)) {
      if (rawValue === null || rawValue === undefined || rawValue === '') {
        continue;
      }

      if (
        typeof rawValue !== 'string' &&
        typeof rawValue !== 'number' &&
        typeof rawValue !== 'boolean'
      ) {
        continue;
      }

      const normalizedValue = String(rawValue);

      if (this.searchableStringFields.includes(key as never)) {
        andFilters.push({
          [key]: {
            contains: normalizedValue,
            mode: 'insensitive',
          },
        });
        continue;
      }

      if (this.exactFields.includes(key as never)) {
        andFilters.push({
          [key]: normalizedValue,
        });
        continue;
      }

      if (this.dateFields.includes(key as never)) {
        const date = new Date(normalizedValue);
        if (!Number.isNaN(date.getTime())) {
          andFilters.push({
            [key]: date,
          });
        }
      }
    }

    if (andFilters.length > 0) {
      where.AND = andFilters;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      message: 'Lấy danh sách user thành công',
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

  async createOrUpdateFromApp(dto: FromAppUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: {
        tenantId: dto.tenantId,
        OR: [{ rocketUserId: dto.userId }, { username: dto.username }],
      },
    });

    if (existing) {
      const updated = await this.prisma.user.update({
        where: {
          id: existing.id,
        },
        data: {
          rocketUserId: dto.userId,
          username: dto.username,
          email: dto.email,
          name: dto.name,
        },
      });

      return {
        message: 'User đã tồn tại, cập nhật dữ liệu thành công',
        data: {
          user: updated,
          created: false,
        },
      };
    }

    const created = await this.prisma.user.create({
      data: {
        tenantId: dto.tenantId,
        rocketUserId: dto.userId,
        username: dto.username,
        email: dto.email,
        name: dto.name,
      },
    });

    return {
      message: 'Tạo user từ app context thành công',
      data: {
        user: created,
        created: true,
      },
    };
  }

  async updateUser(dto: UpdateUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: {
        id: dto.id,
        tenantId: dto.tenantId,
      },
    });

    if (!existing) {
      throw new AppException(HttpStatus.NOT_FOUND, {
        message: 'Không tìm thấy user',
        errorCode: 'USER_NOT_FOUND',
        data: {
          id: dto.id,
          tenantId: dto.tenantId,
        },
      });
    }

    const updated = await this.prisma.user.update({
      where: { id: dto.id },
      data: {
        name: dto.name,
        email: dto.email,
        username: dto.username,
        role: dto.role,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        address: dto.address,
        citizenId: dto.citizenId,
        phoneNumber: dto.phoneNumber,
        avatarUrl: dto.avatarUrl,
      },
    });

    return {
      message: 'Cập nhật user thành công',
      data: updated,
    };
  }

  async deleteUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new AppException(HttpStatus.NOT_FOUND, {
        message: 'Không tìm thấy user',
        errorCode: 'USER_NOT_FOUND',
        data: { id },
      });
    }

    try {
      const rocketRes = await this.rocketChatService.deleteUser(
        user.tenantId,
        user.rocketUserId,
      );

      if (!rocketRes?.data?.success) {
        throw new AppException(HttpStatus.BAD_REQUEST, {
          message: 'Xoá user trên Rocket.Chat thất bại',
          errorCode: 'ROCKET_DELETE_USER_FAILED',
          data: rocketRes?.data ?? null,
        });
      }
    } catch (error) {
      const message = this.getErrorMessage(error);
      if (!message.toLowerCase().includes('not found')) {
        throw new AppException(HttpStatus.BAD_REQUEST, {
          message: 'Xoá user trên Rocket.Chat thất bại',
          errorCode: 'ROCKET_DELETE_USER_FAILED',
          data: {
            id,
            reason: message,
          },
        });
      }
    }

    await this.prisma.user.delete({
      where: { id },
    });

    return {
      message: 'Xoá user thành công',
      data: {
        id,
      },
    };
  }

  async syncUsersFromRocket(tenantId: string) {
    let offset = 0;
    const count = 100;
    const synced: Array<any> = [];

    while (true) {
      const res = await this.rocketChatService.listUsers(
        tenantId,
        offset,
        count,
      );
      const data = res?.data;
      const users = Array.isArray(data?.users) ? data.users : [];

      for (const ru of users) {
        const rocketUserId = String(ru._id ?? '');
        const username = String(ru.username ?? '').trim();
        const email =
          Array.isArray(ru.emails) && ru.emails[0]
            ? String(ru.emails[0].address ?? '')
            : undefined;
        const name = String(ru.name ?? '') || username;

        const existing = await this.prisma.user.findFirst({
          where: {
            tenantId,
            OR: [{ rocketUserId }, { username }],
          },
        });

        if (existing) {
          const updated = await this.prisma.user.update({
            where: { id: existing.id },
            data: {
              rocketUserId,
              username,
              email,
              name,
            },
          });
          synced.push(updated);
        } else {
          const created = await this.prisma.user.create({
            data: {
              tenantId,
              rocketUserId,
              username,
              email,
              name,
            },
          });
          synced.push(created);
        }
      }

      const total = Number(data?.total ?? users.length + offset);
      offset += users.length;
      if (offset >= total || users.length === 0) break;
    }

    return {
      message: 'Đồng bộ users từ Rocket.Chat hoàn tất',
      data: { syncedCount: synced.length },
    };
  }

  private cleanOptionalString(value?: string): string | undefined {
    if (!value) {
      return undefined;
    }

    return value.trim() || undefined;
  }

  private toNumber(value: unknown, fallback: number): number {
    const parsed = Number(value);
    if (Number.isNaN(parsed) || parsed <= 0) {
      return fallback;
    }

    return parsed;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof AppException) {
      return error.message;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'UNKNOWN_ERROR';
  }
}
