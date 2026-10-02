import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { FeeType, Prisma, Role, UserStatus } from '@prisma/client';
import { hash } from 'bcryptjs';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOutletDto, ListFeeLedgerDto, UpdateFeeDto } from './admin.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  listOutlets() {
    return this.prisma.outlet.findMany({
      include: {
        tenant: true,
        settings: { select: { storeName: true, logoUrl: true } },
        feeConfigs: { orderBy: { effectiveFrom: 'desc' }, take: 1 },
        _count: { select: { memberships: true, transactions: true } },
      },
      orderBy: [{ tenant: { name: 'asc' } }, { name: 'asc' }],
    });
  }

  listTenants() {
    return this.prisma.tenant.findMany({
      include: { _count: { select: { outlets: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createOutlet(dto: CreateOutletDto) {
    this.validateFee(
      dto.feeType ?? FeeType.NONE,
      dto.fixedAmount,
      dto.percentage,
    );
    try {
      return await this.prisma.$transaction(async (tx) => {
        const tenant = dto.tenantId
          ? await tx.tenant.findUnique({ where: { id: dto.tenantId } })
          : await tx.tenant.create({
              data: {
                name: dto.tenantName!.trim(),
                slug: dto.tenantSlug!.trim().toLowerCase(),
              },
            });
        if (!tenant) throw new NotFoundException('Tenant not found');
        const outlet = await tx.outlet.create({
          data: {
            tenantId: tenant.id,
            name: dto.outletName.trim(),
            code: dto.outletCode.trim().toUpperCase(),
            settings: {
              create: {
                id: `outlet-${randomUUID()}`,
                storeName: dto.outletName.trim(),
              },
            },
            feeConfigs: {
              create: {
                type: dto.feeType ?? FeeType.NONE,
                fixedAmount: dto.fixedAmount ?? 0,
                percentage: dto.percentage ?? 0,
              },
            },
          },
          include: { tenant: true, settings: true, feeConfigs: true },
        });
        const ownerEmail = dto.ownerEmail.trim().toLowerCase();
        const existingOwner = await tx.user.findUnique({
          where: { email: ownerEmail },
          include: {
            outletMemberships: {
              where: { outlet: { tenantId: tenant.id } },
              take: 1,
            },
          },
        });
        if (existingOwner) {
          if (
            existingOwner.role === Role.SUPER_ADMIN ||
            !existingOwner.outletMemberships.length
          ) {
            throw new ConflictException(
              'Owner email already belongs to another merchant',
            );
          }
          await tx.outletMembership.create({
            data: {
              userId: existingOwner.id,
              outletId: outlet.id,
              role: Role.OWNER,
              isDefault: false,
            },
          });
        } else {
          await tx.user.create({
            data: {
              name: dto.ownerName.trim(),
              email: ownerEmail,
              passwordHash: await hash(dto.ownerPassword, 10),
              role: Role.OWNER,
              status: UserStatus.ACTIVE,
              outletMemberships: {
                create: {
                  outletId: outlet.id,
                  role: Role.OWNER,
                  isDefault: true,
                },
              },
            },
          });
        }
        return outlet;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Tenant slug, outlet code, or owner email already exists',
        );
      }
      throw error;
    }
  }

  async setFee(outletId: string, dto: UpdateFeeDto) {
    this.validateFee(dto.type, dto.fixedAmount, dto.percentage);
    const outlet = await this.prisma.outlet.findUnique({
      where: { id: outletId },
    });
    if (!outlet) throw new NotFoundException('Outlet not found');
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await tx.feeConfig.updateMany({
        where: { outletId, effectiveTo: null },
        data: { effectiveTo: now },
      });
      return tx.feeConfig.create({
        data: {
          outletId,
          type: dto.type,
          fixedAmount: dto.fixedAmount ?? 0,
          percentage: dto.percentage ?? 0,
          effectiveFrom: now,
        },
      });
    });
  }

  async updateOutlet(outletId: string, dto: { name?: string; code?: string }) {
    try {
      return await this.prisma.outlet.update({
        where: { id: outletId },
        data: {
          name: dto.name?.trim(),
          code: dto.code?.trim().toUpperCase(),
          settings: dto.name
            ? { update: { storeName: dto.name.trim() } }
            : undefined,
        },
        include: { tenant: true, settings: true, feeConfigs: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      )
        throw new NotFoundException('Outlet not found');
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('Outlet code already exists');
      throw error;
    }
  }

  async setStatus(outletId: string, status: 'ACTIVE' | 'SUSPENDED') {
    const result = await this.prisma.outlet.updateMany({
      where: { id: outletId },
      data: { status },
    });
    if (!result.count) throw new NotFoundException('Outlet not found');
    return this.prisma.outlet.findUniqueOrThrow({ where: { id: outletId } });
  }

  removeOutlet(outletId: string) {
    return this.setStatus(outletId, 'SUSPENDED');
  }

  async feeLedger(query: ListFeeLedgerDto) {
    const where = { outletId: query.outletId };
    const [data, total, aggregate] = await this.prisma.$transaction([
      this.prisma.feeLedger.findMany({
        where,
        include: {
          outlet: { select: { id: true, name: true, code: true } },
          transaction: {
            select: { invoiceNo: true, total: true, status: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.feeLedger.count({ where }),
      this.prisma.feeLedger.aggregate({ where, _sum: { amount: true } }),
    ]);
    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
        netAmount: aggregate._sum.amount ?? 0,
      },
    };
  }

  private validateFee(type: FeeType, fixedAmount = 0, percentage = 0) {
    if (
      (type === FeeType.FIXED || type === FeeType.HYBRID) &&
      fixedAmount <= 0
    ) {
      throw new UnprocessableEntityException(
        'Fixed fee must be greater than zero',
      );
    }
    if (
      (type === FeeType.PERCENTAGE || type === FeeType.HYBRID) &&
      percentage <= 0
    ) {
      throw new UnprocessableEntityException(
        'Fee percentage must be greater than zero',
      );
    }
  }
}
