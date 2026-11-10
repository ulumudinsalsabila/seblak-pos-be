import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role, TransactionStatus } from '@prisma/client';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { jakartaDayRange } from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/current-user.decorator';
import { requireOutlet } from '../common/outlet-context';
import { DashboardService } from './dashboard.service';
import { OwnerDashboardDto } from './dashboard.dto';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.MANAGER)
export class DashboardController {
  constructor(
    private readonly reports: ReportsService,
    private readonly prisma: PrismaService,
    private readonly dashboard: DashboardService,
  ) {}
  @Get('owner')
  async owner(
    @CurrentUser() user: AuthUser,
    @Query() query: OwnerDashboardDto,
  ) {
    return { data: await this.dashboard.owner(user, query), meta: null };
  }
  @Get()
  async get(@CurrentUser() user: AuthUser) {
    const outletId = requireOutlet(user);
    const { start, end } = jakartaDayRange();
    const [summary, recentTransactions, topProducts, payments] =
      await Promise.all([
        this.reports.summary(outletId),
        this.prisma.transaction.findMany({
          where: { outletId, status: TransactionStatus.PAID },
          take: 5,
          orderBy: { paidAt: 'desc' },
          include: { cashier: { select: { name: true } } },
        }),
        this.reports.products(outletId),
        this.reports.payments(outletId),
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
