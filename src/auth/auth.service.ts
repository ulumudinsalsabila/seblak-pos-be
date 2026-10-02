import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, UserStatus } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

const ACCESS_SECONDS = 60 * 60;
const REFRESH_SECONDS = 7 * 24 * 60 * 60;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });
    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      !(await compare(dto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Email or password is incorrect');
    }
    return this.issueSession(user.id, user.email, user.role);
  }

  async refresh(token?: string) {
    if (!token) throw new UnauthorizedException('Refresh token is required');
    let payload: { sub: string; jti: string; outletId?: string | null };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }
    const record = await this.prisma.refreshToken.findUnique({
      where: { id: payload.jti },
      include: { user: true },
    });
    if (
      !record ||
      record.revokedAt ||
      record.expiresAt <= new Date() ||
      !(await compare(token, record.tokenHash))
    ) {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }
    if (record.user.status !== UserStatus.ACTIVE)
      throw new UnauthorizedException('User is inactive');

    const revoked = await this.prisma.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count !== 1)
      throw new UnauthorizedException('Refresh token has already been used');
    return this.issueSession(
      record.user.id,
      record.user.email,
      record.user.role,
      payload.outletId ?? undefined,
    );
  }

  async switchOutlet(userId: string, outletId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== UserStatus.ACTIVE)
      throw new UnauthorizedException('User is inactive');
    return this.issueSession(user.id, user.email, user.role, outletId);
  }

  outlets(userId: string) {
    return this.prisma.outletMembership.findMany({
      where: {
        userId,
        status: UserStatus.ACTIVE,
        outlet: { status: 'ACTIVE', tenant: { status: 'ACTIVE' } },
      },
      select: {
        role: true,
        isDefault: true,
        outlet: {
          select: { id: true, name: true, code: true, tenantId: true },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { outlet: { name: 'asc' } }],
    });
  }

  async logout(token?: string) {
    if (!token) return;
    try {
      const payload = await this.jwt.verifyAsync<{ jti: string }>(token, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
        ignoreExpiration: true,
      });
      await this.prisma.refreshToken.updateMany({
        where: { id: payload.jti, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      return;
    }
  }

  private async issueSession(
    userId: string,
    email: string,
    role: string,
    preferredOutletId?: string,
  ) {
    const membership =
      role === Role.SUPER_ADMIN
        ? null
        : await this.prisma.outletMembership.findFirst({
            where: {
              userId,
              status: UserStatus.ACTIVE,
              ...(preferredOutletId ? { outletId: preferredOutletId } : {}),
              outlet: {
                status: 'ACTIVE',
                tenant: { status: 'ACTIVE' },
              },
            },
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
            select: { outletId: true, role: true },
          });
    if (role !== Role.SUPER_ADMIN && !membership) {
      throw new UnauthorizedException('User has no active outlet');
    }
    const accessToken = await this.jwt.signAsync(
      {
        sub: userId,
        email,
        role: membership?.role ?? role,
        outletId: membership?.outletId ?? null,
      },
      {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
        expiresIn: ACCESS_SECONDS,
      },
    );
    const jti = randomUUID();
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, jti, outletId: membership?.outletId ?? null },
      {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: REFRESH_SECONDS,
      },
    );
    await this.prisma.refreshToken.create({
      data: {
        id: jti,
        userId,
        tokenHash: await hash(refreshToken, 10),
        expiresAt: new Date(Date.now() + REFRESH_SECONDS * 1000),
      },
    });
    return { accessToken, refreshToken, expiresIn: ACCESS_SECONDS };
  }
}
