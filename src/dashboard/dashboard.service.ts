import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma, Role, TransactionStatus, UserStatus } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import {
  calendarDateRange,
  jakartaDateString,
  jakartaRange,
} from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';
import {
  DashboardBucket,
  DashboardScope,
  OwnerDashboardDto,
} from './dashboard.dto';

type Range = { gte: Date; lt: Date };
type Bucket = DashboardBucket.HOUR | DashboardBucket.DAY;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Asia/Jakarta has no DST, so a fixed offset is exact. */
const JAKARTA_OFFSET_MS = 7 * HOUR_MS;
const MAX_RANGE_DAYS = 366;
const MAX_HOURLY_DAYS = 7;

/**
 * Metric contract (owner sign-off 2026-11-10):
 * - Omzet = netSales = Σ subtotal − Σ discount of PAID transactions (excludes tax).
 * - AOV = netSales / PAID transaction count.
 * - Voids are counted on the day they were voided (`voidedAt`).
 * - Gross profit only when every sold item in range has a cost snapshot.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async owner(user: AuthUser, query: OwnerDashboardDto) {
    // Only outlets where the caller is OWNER or MANAGER: a membership with a
    // lower role (cashier/kitchen) must not unlock that outlet's financials.
    const access = await this.prisma.outletMembership.findMany({
      where: {
        userId: user.id,
        status: UserStatus.ACTIVE,
        role: { in: [Role.OWNER, Role.MANAGER] },
        outlet: {
          tenantId: user.tenantId ?? undefined,
          status: 'ACTIVE',
          tenant: { status: 'ACTIVE' },
        },
      },
      select: { outlet: { select: { id: true, name: true, code: true } } },
      orderBy: { outlet: { name: 'asc' } },
    });
    const allowedIds = access.map(({ outlet }) => outlet.id);
    const requestedOutlet = query.outletId ?? user.outletId;
    const outletIds =
      query.scope === DashboardScope.AUTHORIZED_OUTLETS
        ? allowedIds
        : requestedOutlet && allowedIds.includes(requestedOutlet)
          ? [requestedOutlet]
          : [];
    if (!outletIds.length) {
      throw new ForbiddenException('No dashboard outlet is authorized');
    }

    const dateFrom = query.dateFrom ?? query.dateTo ?? jakartaDateString();
    const dateTo = query.dateTo ?? dateFrom;
    if (dateFrom > dateTo)
      throw new BadRequestException('dateFrom must not be after dateTo');
    const range = jakartaRange(dateFrom, dateTo);
    const duration = range.lt.getTime() - range.gte.getTime();
    if (duration > MAX_RANGE_DAYS * DAY_MS)
      throw new BadRequestException(
        `Date range must not exceed ${MAX_RANGE_DAYS} days`,
      );
    const bucket = this.resolveBucket(query.bucket, duration);
    if (bucket === DashboardBucket.HOUR && duration > MAX_HOURLY_DAYS * DAY_MS)
      throw new BadRequestException(
        `Hourly buckets support at most ${MAX_HOURLY_DAYS} days`,
      );

    const now = new Date();
    const previousRange = {
      gte: new Date(range.gte.getTime() - duration),
      lt: range.gte,
    };
    // A period still in progress (e.g. "today") is compared with the same
    // elapsed time of the previous period, not with the whole previous period.
    const elapsed =
      Math.min(now.getTime(), range.lt.getTime()) - range.gte.getTime();
    const previousSummaryRange =
      elapsed > 0 && elapsed < duration
        ? {
            gte: previousRange.gte,
            lt: new Date(previousRange.gte.getTime() + elapsed),
          }
        : previousRange;
    const previousDates = this.dateStrings(previousRange);

    const [
      summary,
      previous,
      trend,
      previousTrend,
      paymentMix,
      topProducts,
      categorySales,
      outletPerformance,
      lowStock,
      recentTransactions,
    ] = await Promise.all([
      this.summary(outletIds, range, dateFrom, dateTo),
      query.comparison
        ? this.summary(outletIds, previousSummaryRange, ...previousDates)
        : Promise.resolve(null),
      this.trend(outletIds, range, bucket, now),
      query.comparison
        ? this.trend(outletIds, previousRange, bucket, now)
        : Promise.resolve([]),
      this.prisma.transaction.groupBy({
        by: ['paymentMethod'],
        where: {
          outletId: { in: outletIds },
          status: TransactionStatus.PAID,
          paidAt: range,
        },
        _count: { _all: true },
        _sum: { total: true },
        orderBy: { paymentMethod: 'asc' },
      }),
      this.prisma.transactionItem.groupBy({
        by: ['productId', 'productName', 'sku'],
        where: {
          outletId: { in: outletIds },
          transaction: { status: TransactionStatus.PAID, paidAt: range },
        },
        _sum: { quantity: true, subtotal: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 8,
      }),
      this.prisma.transactionItem.groupBy({
        by: ['categoryId', 'categoryName'],
        where: {
          outletId: { in: outletIds },
          transaction: { status: TransactionStatus.PAID, paidAt: range },
        },
        _sum: { quantity: true, subtotal: true },
        orderBy: { _sum: { subtotal: 'desc' } },
        take: 8,
      }),
      this.outletPerformance(outletIds, range),
      this.lowStock(outletIds),
      this.prisma.transaction.findMany({
        where: {
          outletId: { in: outletIds },
          status: TransactionStatus.PAID,
          paidAt: range,
        },
        take: 8,
        orderBy: { paidAt: 'desc' },
        select: {
          id: true,
          invoiceNo: true,
          paidAt: true,
          total: true,
          paymentMethod: true,
          status: true,
          customerName: true,
          cashier: { select: { id: true, name: true } },
          outlet: { select: { id: true, name: true, code: true } },
        },
      }),
    ]);

    return {
      context: {
        scope: query.scope,
        outletIds,
        outlets: access.map(({ outlet }) => outlet),
        timezone: 'Asia/Jakarta',
        currency: 'IDR',
      },
      period: {
        dateFrom,
        dateTo,
        start: range.gte,
        endExclusive: range.lt,
        comparisonStart: query.comparison ? previousSummaryRange.gte : null,
        comparisonEndExclusive: query.comparison
          ? previousSummaryRange.lt
          : null,
        bucket,
      },
      summary: {
        ...summary,
        comparison: previous ? this.comparisons(summary, previous) : null,
      },
      trend,
      previousTrend,
      paymentMix,
      topProducts,
      categorySales,
      outletPerformance,
      lowStock,
      recentTransactions,
      capabilities: {
        grossProfit: summary.costCoverage.complete,
        refunds: false,
        lowStock: true,
      },
      generatedAt: now,
    };
  }

  private async summary(
    outletIds: string[],
    range: Range,
    dateFrom: string,
    dateTo: string,
  ) {
    const transactionWhere = {
      outletId: { in: outletIds },
      status: TransactionStatus.PAID,
      paidAt: range,
    };
    const [sales, expenses, transactionCount, voids, costs, missingCosts] =
      await Promise.all([
        this.prisma.transaction.aggregate({
          where: transactionWhere,
          _sum: { subtotal: true, discount: true, tax: true, total: true },
        }),
        this.prisma.expense.aggregate({
          where: {
            outletId: { in: outletIds },
            expenseDate: calendarDateRange(dateFrom, dateTo),
          },
          _sum: { amount: true },
        }),
        this.prisma.transaction.count({ where: transactionWhere }),
        this.prisma.transaction.aggregate({
          where: {
            outletId: { in: outletIds },
            status: TransactionStatus.VOID,
            voidedAt: range,
          },
          _count: { _all: true },
          _sum: { subtotal: true, discount: true },
        }),
        this.prisma.transactionItem.aggregate({
          where: { transaction: transactionWhere },
          _count: { _all: true },
          _sum: { costSubtotal: true },
        }),
        this.prisma.transactionItem.count({
          where: { transaction: transactionWhere, costSubtotal: null },
        }),
      ]);
    const grossSales = sales._sum.subtotal ?? 0;
    const discount = sales._sum.discount ?? 0;
    const netSales = grossSales - discount;
    const collected = sales._sum.total ?? 0;
    const expenseTotal = expenses._sum.amount ?? 0;
    const cogs = costs._sum.costSubtotal ?? 0;
    const costItemCount = costs._count._all;
    const complete = costItemCount > 0 && missingCosts === 0;
    return {
      grossSales,
      discount,
      netSales,
      tax: sales._sum.tax ?? 0,
      collected,
      expenses: expenseTotal,
      netCashflow: collected - expenseTotal,
      transactionCount,
      averageOrderValue: transactionCount
        ? Math.round(netSales / transactionCount)
        : 0,
      voidCount: voids._count._all,
      /** Net sales value (excl. tax) of transactions voided in the period. */
      voidValue: (voids._sum.subtotal ?? 0) - (voids._sum.discount ?? 0),
      cogs: complete ? cogs : null,
      grossProfit: complete ? netSales - cogs : null,
      costCoverage: {
        complete,
        totalItems: costItemCount,
        missingItems: missingCosts,
      },
    };
  }

  private comparisons(
    current: Awaited<ReturnType<DashboardService['summary']>>,
    previous: Awaited<ReturnType<DashboardService['summary']>>,
  ) {
    const fields = [
      'netSales',
      'collected',
      'transactionCount',
      'averageOrderValue',
      'discount',
      'voidValue',
      'grossProfit',
      'netCashflow',
    ] as const;
    return Object.fromEntries(
      fields.map((field) => {
        const value = current[field];
        const before = previous[field];
        const percent =
          typeof value === 'number' &&
          typeof before === 'number' &&
          before !== 0
            ? Math.round(((value - before) / Math.abs(before)) * 1000) / 10
            : null;
        return [field, { current: value, previous: before, percent }];
      }),
    );
  }

  private resolveBucket(bucket: DashboardBucket, duration: number): Bucket {
    if (bucket !== DashboardBucket.AUTO) return bucket;
    return duration <= 2 * DAY_MS ? DashboardBucket.HOUR : DashboardBucket.DAY;
  }

  /** Inclusive Jakarta calendar dates covered by an instant range. */
  private dateStrings(range: Range): [string, string] {
    return [
      jakartaDateString(range.gte),
      jakartaDateString(new Date(range.lt.getTime() - 1)),
    ];
  }

  /** Jakarta wall-clock bucket key: `YYYY-MM-DD` or `YYYY-MM-DDTHH:00`. */
  private bucketKey(instant: number, bucket: Bucket) {
    const local = new Date(instant + JAKARTA_OFFSET_MS).toISOString();
    return bucket === DashboardBucket.HOUR
      ? `${local.slice(0, 13)}:00`
      : local.slice(0, 10);
  }

  private async trend(
    outletIds: string[],
    range: Range,
    bucket: Bucket,
    now: Date,
  ) {
    const unit = bucket === DashboardBucket.HOUR ? 'hour' : 'day';
    const format =
      bucket === DashboardBucket.HOUR ? 'YYYY-MM-DD"T"HH24:00' : 'YYYY-MM-DD';
    const rows = await this.prisma.$queryRaw<
      Array<{
        bucket: string;
        netSales: bigint;
        collected: bigint;
        count: bigint;
      }>
    >(Prisma.sql`
      SELECT to_char(date_trunc(${unit}, "paidAt" AT TIME ZONE 'Asia/Jakarta'), ${format}) AS bucket,
             SUM("subtotal" - "discount")::bigint AS "netSales",
             SUM("total")::bigint AS collected,
             COUNT(*)::bigint AS count
      FROM "Transaction"
      WHERE "outletId" IN (${Prisma.join(outletIds.map((id) => Prisma.sql`${id}::uuid`))})
        AND status = 'PAID'
        AND "paidAt" >= ${range.gte}
        AND "paidAt" < ${range.lt}
      GROUP BY 1
    `);
    const byKey = new Map(rows.map((row) => [row.bucket, row]));
    // Zero-fill every bucket that has started, so gaps show as 0 instead of
    // being skipped, and future hours of today are not drawn as zero sales.
    const step = bucket === DashboardBucket.HOUR ? HOUR_MS : DAY_MS;
    const end = Math.min(range.lt.getTime(), now.getTime());
    const points: Array<{
      bucket: string;
      netSales: number;
      collected: number;
      transactionCount: number;
    }> = [];
    for (let t = range.gte.getTime(); t < end; t += step) {
      const key = this.bucketKey(t, bucket);
      const row = byKey.get(key);
      points.push({
        bucket: key,
        netSales: Number(row?.netSales ?? 0),
        collected: Number(row?.collected ?? 0),
        transactionCount: Number(row?.count ?? 0),
      });
    }
    return points;
  }

  private async outletPerformance(outletIds: string[], range: Range) {
    const [rows, outlets] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['outletId'],
        where: {
          outletId: { in: outletIds },
          status: TransactionStatus.PAID,
          paidAt: range,
        },
        _count: { _all: true },
        _sum: { subtotal: true, discount: true, total: true },
      }),
      this.prisma.outlet.findMany({
        where: { id: { in: outletIds } },
        select: { id: true, name: true, code: true },
      }),
    ]);
    const sales = new Map(rows.map((row) => [row.outletId, row]));
    // Every authorized outlet is listed, including those without sales.
    return outlets
      .map((outlet) => {
        const row = sales.get(outlet.id);
        return {
          ...outlet,
          transactionCount: row?._count._all ?? 0,
          netSales: (row?._sum.subtotal ?? 0) - (row?._sum.discount ?? 0),
          collected: row?._sum.total ?? 0,
        };
      })
      .sort((a, b) => b.netSales - a.netSales);
  }

  private async lowStock(outletIds: string[]) {
    const products = await this.prisma.product.findMany({
      where: {
        outletId: { in: outletIds },
        isActive: true,
        trackStock: true,
        lowStockThreshold: { not: null },
      },
      select: {
        id: true,
        outletId: true,
        name: true,
        sku: true,
        stock: true,
        lowStockThreshold: true,
        outlet: { select: { name: true, code: true } },
      },
      orderBy: { stock: 'asc' },
    });
    return products
      .filter(
        (product) =>
          product.stock !== null &&
          product.lowStockThreshold !== null &&
          product.stock <= product.lowStockThreshold,
      )
      .slice(0, 12);
  }
}
