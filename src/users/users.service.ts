import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, Role, UserStatus } from '@prisma/client';
import { hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, ListUsersDto, UpdateUserDto } from './dto/user.dto';

const publicSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(outletId: string, query: ListUsersDto) {
    const search = query.search?.trim();
    const where: Prisma.OutletMembershipWhereInput = {
      outletId,
      role: query.role,
      status: query.status,
      ...(search
        ? {
            user: {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };
    const paginated = query.page !== undefined || query.limit !== undefined;
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const memberships = await this.prisma.outletMembership.findMany({
      where,
      include: { user: { select: publicSelect } },
      orderBy: { user: { name: 'asc' } },
      ...(paginated ? { skip: (page - 1) * limit, take: limit } : {}),
    });
    const data = memberships.map(({ user, role, status }) => ({
      ...user,
      role,
      status,
    }));
    if (!paginated) return { data, meta: null };
    const total = await this.prisma.outletMembership.count({ where });
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async find(outletId: string, id: string) {
    const membership = await this.prisma.outletMembership.findFirst({
      where: { outletId, userId: id },
      include: { user: { select: publicSelect } },
    });
    if (!membership) throw new NotFoundException('User not found');
    return {
      ...membership.user,
      role: membership.role,
      status: membership.status,
    };
  }

  async create(outletId: string, dto: CreateUserDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name: dto.name.trim(),
            email: dto.email.trim().toLowerCase(),
            passwordHash: await hash(dto.password, 10),
            role: dto.role,
            outletMemberships: {
              create: { outletId, role: dto.role, isDefault: true },
            },
          },
          select: publicSelect,
        });
        return user;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('Email already exists');
      throw error;
    }
  }

  async update(outletId: string, id: string, dto: UpdateUserDto) {
    const existing = await this.find(outletId, id);
    if (
      existing.role === Role.OWNER &&
      existing.status === UserStatus.ACTIVE &&
      (dto.status === UserStatus.INACTIVE ||
        (dto.role !== undefined && dto.role !== Role.OWNER))
    ) {
      const activeOwners = await this.prisma.outletMembership.count({
        where: {
          outletId,
          role: Role.OWNER,
          status: UserStatus.ACTIVE,
        },
      });
      if (activeOwners <= 1)
        throw new UnprocessableEntityException(
          'At least one active owner is required',
        );
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id },
          data: {
            name: dto.name?.trim(),
            email: dto.email?.trim().toLowerCase(),
            passwordHash: dto.password
              ? await hash(dto.password, 10)
              : undefined,
          },
          select: publicSelect,
        });
        if (dto.role || dto.status) {
          await tx.outletMembership.update({
            where: { userId_outletId: { userId: id, outletId } },
            data: { role: dto.role, status: dto.status },
          });
        }
        return {
          ...user,
          role: dto.role ?? existing.role,
          status: dto.status ?? existing.status,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('Email already exists');
      throw error;
    }
  }

  async remove(outletId: string, id: string, actorId: string) {
    if (id === actorId) {
      throw new UnprocessableEntityException(
        'You cannot delete your own access',
      );
    }
    const existing = await this.find(outletId, id);
    if (existing.role === Role.OWNER) {
      const activeOwners = await this.prisma.outletMembership.count({
        where: {
          outletId,
          role: Role.OWNER,
          status: UserStatus.ACTIVE,
        },
      });
      if (activeOwners <= 1) {
        throw new UnprocessableEntityException(
          'At least one active owner is required',
        );
      }
    }
    await this.prisma.outletMembership.delete({
      where: { userId_outletId: { userId: id, outletId } },
    });
    return { success: true };
  }
}
