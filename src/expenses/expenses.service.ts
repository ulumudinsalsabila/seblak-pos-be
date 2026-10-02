import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto, UpdateExpenseDto } from './expense.dto';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}
  list(outletId: string) {
    return this.prisma.expense.findMany({
      where: { outletId },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
    });
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
