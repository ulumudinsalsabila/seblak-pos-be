import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto, UpdateExpenseDto } from './expense.dto';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}
  list() {
    return this.prisma.expense.findMany({
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
    });
  }
  async find(id: string) {
    const item = await this.prisma.expense.findUnique({
      where: { id },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    if (!item) throw new NotFoundException('Expense not found');
    return item;
  }
  create(userId: string, dto: CreateExpenseDto) {
    return this.prisma.expense.create({
      data: {
        createdById: userId,
        description: dto.description.trim(),
        amount: dto.amount,
        expenseDate: new Date(`${dto.expenseDate}T00:00:00.000Z`),
        notes: dto.notes?.trim(),
      },
    });
  }
  async update(id: string, dto: UpdateExpenseDto) {
    await this.find(id);
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
  async remove(id: string) {
    await this.find(id);
    await this.prisma.expense.delete({ where: { id } });
    return { success: true };
  }
}
