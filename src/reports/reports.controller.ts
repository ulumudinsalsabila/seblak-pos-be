import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ReportsService } from './reports.service';
import { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/current-user.decorator';
import { requireOutlet } from '../common/outlet-context';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.MANAGER)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get('daily') async daily(
    @CurrentUser() user: AuthUser,
    @Query('dateFrom') from?: string,
    @Query('dateTo') to?: string,
  ) {
    return {
      data: await this.reports.summary(requireOutlet(user), from, to),
      meta: null,
    };
  }
  @Get('sales') async sales(
    @CurrentUser() user: AuthUser,
    @Query('dateFrom') from?: string,
    @Query('dateTo') to?: string,
  ) {
    return {
      data: await this.reports.summary(requireOutlet(user), from, to),
      meta: null,
    };
  }
  @Get('products') async products(
    @CurrentUser() user: AuthUser,
    @Query('dateFrom') from?: string,
    @Query('dateTo') to?: string,
  ) {
    return {
      data: await this.reports.products(requireOutlet(user), from, to),
      meta: null,
    };
  }
  @Get('categories') async categories(
    @CurrentUser() user: AuthUser,
    @Query('dateFrom') from?: string,
    @Query('dateTo') to?: string,
  ) {
    return {
      data: await this.reports.categories(requireOutlet(user), from, to),
      meta: null,
    };
  }
  @Get('payments') async payments(
    @CurrentUser() user: AuthUser,
    @Query('dateFrom') from?: string,
    @Query('dateTo') to?: string,
  ) {
    return {
      data: await this.reports.payments(requireOutlet(user), from, to),
      meta: null,
    };
  }
  @Get('cashiers') async cashiers(
    @CurrentUser() user: AuthUser,
    @Query('dateFrom') from?: string,
    @Query('dateTo') to?: string,
  ) {
    return {
      data: await this.reports.cashiers(requireOutlet(user), from, to),
      meta: null,
    };
  }
  @Get('expenses') async expenses(
    @CurrentUser() user: AuthUser,
    @Query('dateFrom') from?: string,
    @Query('dateTo') to?: string,
  ) {
    return {
      data: await this.reports.expenses(requireOutlet(user), from, to),
      meta: null,
    };
  }
}
