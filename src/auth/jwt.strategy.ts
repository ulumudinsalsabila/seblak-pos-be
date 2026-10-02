import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Role, UserStatus } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/auth-user';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: {
    sub: string;
    outletId?: string | null;
  }): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || user.status !== UserStatus.ACTIVE)
      throw new UnauthorizedException('Session is no longer active');
    if (user.role === Role.SUPER_ADMIN) {
      return {
        id: user.id,
        email: user.email,
        role: Role.SUPER_ADMIN,
        tenantId: null,
        outletId: null,
        outletName: null,
      };
    }
    const membership = await this.prisma.outletMembership.findFirst({
      where: {
        userId: user.id,
        status: UserStatus.ACTIVE,
        outletId: payload.outletId ?? undefined,
        outlet: { status: 'ACTIVE', tenant: { status: 'ACTIVE' } },
      },
      include: { outlet: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    if (!membership)
      throw new UnauthorizedException('Outlet access is no longer active');
    return {
      id: user.id,
      email: user.email,
      role: membership.role,
      tenantId: membership.outlet.tenantId,
      outletId: membership.outletId,
      outletName: membership.outlet.name,
    };
  }
}
