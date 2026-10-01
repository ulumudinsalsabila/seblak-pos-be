import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role, TransactionStatus } from '@prisma/client';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { jakartaDayRange } from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER)
export class DashboardController {
  constructor(
    private readonly reports: ReportsService,
    private readonly prisma: PrismaService,
  ) {}
  @Get()
  async get() {
    const { start, end } = jakartaDayRange();
    const [summary, recentTransactions, topProducts, payments] =
      await Promise.all([
        this.reports.summary(),
        this.prisma.transaction.findMany({
          where: { status: TransactionStatus.PAID },
          take: 5,
          orderBy: { paidAt: 'desc' },
          include: { cashier: { select: { name: true } } },
        }),
        this.reports.products(),
        this.reports.payments(),
      ]);
    return {
      data: {
        summary,
        recentTransactions,
        topProducts: topProducts.slice(0, 5),
        payments,
        period: { start, end },
      },
      meta: null,
    };
  }
}
