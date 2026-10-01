import { Injectable } from '@nestjs/common';
import { TransactionStatus } from '@prisma/client';
import { jakartaRange } from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(dateFrom?: string, dateTo?: string) {
    const range = jakartaRange(dateFrom, dateTo);
    const where = { status: TransactionStatus.PAID, paidAt: range };
    const [sales, expenses, count] = await Promise.all([
      this.prisma.transaction.aggregate({
        where,
        _sum: { subtotal: true, discount: true, tax: true, total: true },
      }),
      this.prisma.expense.aggregate({
        where: { expenseDate: { gte: range.gte, lt: range.lt } },
        _sum: { amount: true },
      }),
      this.prisma.transaction.count({ where }),
    ]);
    const grossSales = sales._sum.subtotal ?? 0;
    const discount = sales._sum.discount ?? 0;
    const netSales = grossSales - discount;
    const tax = sales._sum.tax ?? 0;
    const collected = sales._sum.total ?? 0;
    const expenseTotal = expenses._sum.amount ?? 0;
    return {
      grossSales,
      discount,
      netSales,
      tax,
      collected,
      expenses: expenseTotal,
      netCashflow: collected - expenseTotal,
      transactionCount: count,
      averageOrderValue: count ? Math.round(collected / count) : 0,
    };
  }

  payments(dateFrom?: string, dateTo?: string) {
    return this.prisma.transaction.groupBy({
      by: ['paymentMethod'],
      where: {
        status: TransactionStatus.PAID,
        paidAt: jakartaRange(dateFrom, dateTo),
      },
      _count: { _all: true },
      _sum: { total: true },
      orderBy: { paymentMethod: 'asc' },
    });
  }

  async products(dateFrom?: string, dateTo?: string) {
    return this.prisma.transactionItem.groupBy({
      by: ['productId', 'productName', 'sku'],
      where: {
        transaction: {
          status: TransactionStatus.PAID,
          paidAt: jakartaRange(dateFrom, dateTo),
        },
      },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 100,
    });
  }

  async categories(dateFrom?: string, dateTo?: string) {
    return this.prisma.transactionItem.groupBy({
      by: ['categoryId', 'categoryName'],
      where: {
        transaction: {
          status: TransactionStatus.PAID,
          paidAt: jakartaRange(dateFrom, dateTo),
        },
      },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { subtotal: 'desc' } },
    });
  }

  cashiers(dateFrom?: string, dateTo?: string) {
    return this.prisma.transaction.groupBy({
      by: ['cashierId'],
      where: {
        status: TransactionStatus.PAID,
        paidAt: jakartaRange(dateFrom, dateTo),
      },
      _count: { _all: true },
      _sum: { total: true },
      orderBy: { _sum: { total: 'desc' } },
    });
  }

  expenses(dateFrom?: string, dateTo?: string) {
    return this.prisma.expense.findMany({
      where: { expenseDate: jakartaRange(dateFrom, dateTo) },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: { expenseDate: 'desc' },
    });
  }
}
