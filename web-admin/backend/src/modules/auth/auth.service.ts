/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
import { Injectable, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { AppException } from '../../common/exceptions/app.exception';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tenantId?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(emailOrUsername: string, password: string): Promise<any> {
    const user = await this.prisma.webAdminUser.findFirst({
      where: {
        OR: [{ email: emailOrUsername }, { username: emailOrUsername }],
      },
      include: {
        tenant: true,
      },
    });

    if (!user || !user.isActive) {
      throw new AppException(HttpStatus.UNAUTHORIZED, {
        message: 'Email/username hoặc mật khẩu không chính xác',
        errorCode: 'INVALID_CREDENTIALS',
      });
    }

    const passwordMatch = await bcrypt.compare(
      password,
      user.hashedPassword as string,
    );
    if (!passwordMatch) {
      throw new AppException(HttpStatus.UNAUTHORIZED, {
        message: 'Email/username hoặc mật khẩu không chính xác',
        errorCode: 'INVALID_CREDENTIALS',
      });
    }

    return user;
  }

  async login(loginDto: LoginDto): Promise<{
    access_token: string;
    user: {
      id: string;
      email: string;
      username: string;
      role: string;
      tenantId: string | null;
    };
  }> {
    const emailOrUsername = loginDto.email || loginDto.username;
    if (!emailOrUsername) {
      throw new AppException(HttpStatus.BAD_REQUEST, {
        message: 'Email hoặc username là bắt buộc',
        errorCode: 'INVALID_REQUEST',
      });
    }
    const user = await this.validateUser(emailOrUsername, loginDto.password);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId ?? undefined,
    };

    const access_token = this.jwtService.sign(payload, {
      expiresIn: '24h',
    });

    // Update lastLoginAt
    await this.prisma.webAdminUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      access_token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }

  async validateJwtPayload(payload: JwtPayload): Promise<{
    id: string;
    email: string;
    username: string;
    role: string;
    tenantId: string | null;
  } | null> {
    const user = await this.prisma.webAdminUser.findUnique({
      where: { id: payload.sub },
      include: {
        tenant: true,
      },
    });

    if (!user || !user.isActive) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      tenantId: user.tenantId,
    };
  }

  hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }
}
