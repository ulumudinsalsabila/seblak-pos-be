import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, Role, UserStatus } from '@prisma/client';
import { hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

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

  list() {
    return this.prisma.user.findMany({
      select: publicSelect,
      orderBy: { name: 'asc' },
    });
  }

  async find(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: publicSelect,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(dto: CreateUserDto) {
    try {
      return await this.prisma.user.create({
        data: {
          name: dto.name.trim(),
          email: dto.email.trim().toLowerCase(),
          passwordHash: await hash(dto.password, 10),
          role: dto.role,
        },
        select: publicSelect,
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

  async update(id: string, dto: UpdateUserDto) {
    const existing = await this.find(id);
    if (
      existing.role === Role.OWNER &&
      existing.status === UserStatus.ACTIVE &&
      (dto.status === UserStatus.INACTIVE || dto.role === Role.CASHIER)
    ) {
      const activeOwners = await this.prisma.user.count({
        where: { role: Role.OWNER, status: UserStatus.ACTIVE },
      });
      if (activeOwners <= 1)
        throw new UnprocessableEntityException(
          'At least one active owner is required',
        );
    }
    try {
      return await this.prisma.user.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          email: dto.email?.trim().toLowerCase(),
          role: dto.role,
          status: dto.status,
          passwordHash: dto.password ? await hash(dto.password, 10) : undefined,
        },
        select: publicSelect,
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
}
