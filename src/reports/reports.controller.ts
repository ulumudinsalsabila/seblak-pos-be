import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get('daily') async daily(
    @Query('dateFrom') from?: string,
    @Query('dateTo') to?: string,
  ) {
    return { data: await this.reports.summary(from, to), meta: null };
  }
  @Get('sales') async sales(
    @Query('dateFrom') from?: string,
    @Query('dateTo') to?: string,
  ) {
    return { data: await this.reports.summary(from, to), meta: null };
  }
  @Get('products') async products(
    @Query('dateFrom') from?: string,
    @Query('dateTo') to?: string,
  ) {
    return { data: await this.reports.products(from, to), meta: null };
  }
  @Get('categories') async categories(
    @Query('dateFrom') from?: string,
    @Query('dateTo') to?: string,
  ) {
    return { data: await this.reports.categories(from, to), meta: null };
  }
  @Get('payments') async payments(
    @Query('dateFrom') from?: string,
    @Query('dateTo') to?: string,
  ) {
    return { data: await this.reports.payments(from, to), meta: null };
  }
  @Get('cashiers') async cashiers(
    @Query('dateFrom') from?: string,
    @Query('dateTo') to?: string,
  ) {
    return { data: await this.reports.cashiers(from, to), meta: null };
  }
  @Get('expenses') async expenses(
    @Query('dateFrom') from?: string,
    @Query('dateTo') to?: string,
  ) {
    return { data: await this.reports.expenses(from, to), meta: null };
  }
}
