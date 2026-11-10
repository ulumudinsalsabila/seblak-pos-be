import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { calendarDateRange } from '../common/dates';
import {
  CreateExpenseDto,
  ListExpensesDto,
  UpdateExpenseDto,
} from './expense.dto';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}
  async list(outletId: string, query: ListExpensesDto) {
    const search = query.search?.trim();
    const where: Prisma.ExpenseWhereInput = {
      outletId,
      createdById: query.createdById,
      expenseDate:
        query.dateFrom || query.dateTo
          ? calendarDateRange(
              query.dateFrom ?? query.dateTo,
              query.dateTo ?? query.dateFrom,
            )
          : undefined,
      ...(search
        ? {
            OR: [
              { description: { contains: search, mode: 'insensitive' } },
              { notes: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const paginated = query.page !== undefined || query.limit !== undefined;
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const findMany = this.prisma.expense.findMany({
      where,
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: [{ [query.sortBy]: query.sortOrder }, { createdAt: 'desc' }],
      ...(paginated ? { skip: (page - 1) * limit, take: limit } : {}),
    });
    if (!paginated) return { data: await findMany, meta: null };
    const [data, total] = await Promise.all([
      findMany,
      this.prisma.expense.count({ where }),
    ]);
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
  async find(outletId: string, id: string) {
    const item = await this.prisma.expense.findFirst({
      where: { id, outletId },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    if (!item) throw new NotFoundException('Expense not found');
    return item;
  }
  create(outletId: string, userId: string, dto: CreateExpenseDto) {
    return this.prisma.expense.create({
      data: {
        outletId,
        createdById: userId,
        description: dto.description.trim(),
        amount: dto.amount,
        expenseDate: new Date(`${dto.expenseDate}T00:00:00.000Z`),
        notes: dto.notes?.trim(),
      },
    });
  }
  async update(outletId: string, id: string, dto: UpdateExpenseDto) {
    await this.find(outletId, id);
    return this.prisma.expense.update({
      where: { id },
      data: {
        description: dto.description?.trim(),
        amount: dto.amount,
        expenseDate: dto.expenseDate
          ? new Date(`${dto.expenseDate}T00:00:00.000Z`)
          : undefined,
        notes: dto.notes?.trim(),
      },
    });
  }
  async remove(outletId: string, id: string) {
    await this.find(outletId, id);
    await this.prisma.expense.delete({ where: { id } });
    return { success: true };
  }
}
