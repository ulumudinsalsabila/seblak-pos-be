import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PaymentMethod, Prisma, TransactionStatus } from '@prisma/client';
import { jakartaRange } from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto, ListTransactionsDto } from './transaction.dto';
import { calculateTotals } from './calculation';

const includeDetail = {
  items: true,
  cashier: { select: { id: true, name: true } },
  voidedBy: { select: { id: true, name: true } },
} as const;

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(cashierId: string, dto: CreateTransactionDto) {
    const existing = await this.prisma.transaction.findUnique({
      where: { clientTransactionId: dto.clientTransactionId },
      include: includeDetail,
    });
    if (existing) return existing;
    if (
      new Set(dto.items.map((item) => item.productId)).size !== dto.items.length
    ) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_ERROR',
        message: 'Duplicate productId is not allowed',
      });
    }

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const duplicate = await tx.transaction.findUnique({
            where: { clientTransactionId: dto.clientTransactionId },
            include: includeDetail,
          });
          if (duplicate) return duplicate;

          const [settings, products] = await Promise.all([
            tx.storeSettings.upsert({
              where: { id: 'default' },
              create: { id: 'default' },
              update: {},
            }),
            tx.product.findMany({
              where: { id: { in: dto.items.map((item) => item.productId) } },
              include: { category: true },
            }),
          ]);
          const productMap = new Map(
            products.map((product) => [product.id, product]),
          );
          const lines = dto.items.map((item) => {
            const product = productMap.get(item.productId);
            if (!product)
              throw new NotFoundException(
                `Product ${item.productId} not found`,
              );
            if (!product.isActive)
              throw new UnprocessableEntityException({
                code: 'PRODUCT_INACTIVE',
                message: `${product.name} is inactive`,
              });
            if (!product.category.isActive)
              throw new UnprocessableEntityException({
                code: 'CATEGORY_INACTIVE',
                message: `Category for ${product.name} is inactive`,
              });
            const subtotal = product.price * item.quantity;
            if (!Number.isSafeInteger(subtotal) || subtotal > 2_000_000_000)
              throw new UnprocessableEntityException(
                'Item subtotal exceeds transaction limit',
              );
            return { product, quantity: item.quantity, subtotal };
          });

          const subtotal = lines.reduce((sum, line) => sum + line.subtotal, 0);
          if (dto.discount > subtotal)
            throw new UnprocessableEntityException({
              code: 'DISCOUNT_EXCEEDS_SUBTOTAL',
              message: 'Discount cannot exceed subtotal',
            });
          const taxPercentage = settings.taxEnabled
            ? Number(settings.taxPercentage)
            : 0;
          const { tax, total } = calculateTotals(
            lines.map((line) => line.subtotal),
            dto.discount,
            taxPercentage,
          );
          if (total > 2_000_000_000)
            throw new UnprocessableEntityException(
              'Transaction total exceeds limit',
            );

          let amountReceived: number | null = null;
          let changeAmount = 0;
          if (dto.paymentMethod === PaymentMethod.CASH) {
            if (
              dto.amountReceived === undefined ||
              dto.amountReceived < total
            ) {
              throw new UnprocessableEntityException({
                code: 'INSUFFICIENT_PAYMENT',
                message: 'Amount received is less than total',
              });
            }
            amountReceived = dto.amountReceived;
            changeAmount = amountReceived - total;
          }

          for (const line of lines) {
            if (!line.product.trackStock) continue;
            const updated = await tx.product.updateMany({
              where: {
                id: line.product.id,
                trackStock: true,
                stock: { gte: line.quantity },
              },
              data: { stock: { decrement: line.quantity } },
            });
            if (updated.count !== 1)
              throw new UnprocessableEntityException({
                code: 'INSUFFICIENT_STOCK',
                message: `Stock ${line.product.name} is insufficient`,
              });
          }

          const businessDate = this.businessDate();
          const counter = await tx.dailyInvoiceCounter.upsert({
            where: { businessDate: new Date(`${businessDate}T00:00:00.000Z`) },
            create: {
              businessDate: new Date(`${businessDate}T00:00:00.000Z`),
              lastSequence: 1,
            },
            update: { lastSequence: { increment: 1 } },
          });
          const invoiceNo = `SBL-${businessDate.replaceAll('-', '')}-${String(counter.lastSequence).padStart(4, '0')}`;

          return tx.transaction.create({
            data: {
              clientTransactionId: dto.clientTransactionId,
              invoiceNo,
              cashierId,
              subtotal,
              discount: dto.discount,
              tax,
              taxPercentage,
              total,
              customerName: dto.customerName.trim(),
              orderType: dto.orderType,
              spicyLevel: dto.spicyLevel,
              brothLevel: dto.brothLevel,
              tastePreference: dto.tastePreference,
              notes: dto.notes?.trim() || null,
              paymentMethod: dto.paymentMethod,
              amountReceived,
              changeAmount,
              storeName: settings.storeName,
              storeAddress: settings.address,
              storePhone: settings.phone,
              currency: settings.currency,
              receiptHeader: settings.receiptHeader,
              receiptFooter: settings.receiptFooter,
              receiptPaperSize: settings.receiptPaperSize,
              items: {
                create: lines.map((line) => ({
                  productId: line.product.id,
                  productName: line.product.name,
                  categoryId: line.product.category.id,
                  categoryName: line.product.category.name,
                  sku: line.product.sku,
                  pricingType: line.product.pricingType,
                  trackStock: line.product.trackStock,
                  unitPrice: line.product.price,
                  quantity: line.quantity,
                  subtotal: line.subtotal,
                })),
              },
            },
            include: includeDetail,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const winner = await this.prisma.transaction.findUnique({
          where: { clientTransactionId: dto.clientTransactionId },
          include: includeDetail,
        });
        if (winner) return winner;
        throw new ConflictException({
          code: 'INVOICE_CONFLICT',
          message: 'Invoice number conflict, please retry',
        });
      }
      throw error;
    }
  }

  async list(query: ListTransactionsDto) {
    const safePage = query.page;
    const safeLimit = query.limit;
    const where: Prisma.TransactionWhereInput = {
      status: query.status,
      cashierId: query.cashierId,
      paymentMethod: query.paymentMethod,
      invoiceNo: query.invoiceNo
        ? { contains: query.invoiceNo, mode: 'insensitive' }
        : undefined,
      paidAt:
        query.dateFrom || query.dateTo
          ? jakartaRange(
              query.dateFrom ?? query.dateTo,
              query.dateTo ?? query.dateFrom,
            )
          : undefined,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        include: includeDetail,
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.transaction.count({ where }),
    ]);
    return {
      data,
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async find(id: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
      include: includeDetail,
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    return transaction;
  }

  async void(id: string, ownerId: string, reason: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const transaction = await tx.transaction.findUnique({
          where: { id },
          include: { items: true },
        });
        if (!transaction) throw new NotFoundException('Transaction not found');
        const changed = await tx.transaction.updateMany({
          where: { id, status: TransactionStatus.PAID },
          data: {
            status: TransactionStatus.VOID,
            voidedAt: new Date(),
            voidedById: ownerId,
            voidReason: reason.trim(),
          },
        });
        if (changed.count !== 1)
          throw new ConflictException({
            code: 'TRANSACTION_ALREADY_VOID',
            message: 'Transaction is already void',
          });
        for (const item of transaction.items) {
          if (item.trackStock && item.productId) {
            const restored = await tx.product.updateMany({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } },
            });
            if (restored.count !== 1)
              throw new ConflictException(
                'Tracked product could not be restored',
              );
          }
        }
        return tx.transaction.findUniqueOrThrow({
          where: { id },
          include: includeDetail,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private businessDate() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts();
    const get = (type: string) =>
      parts.find((part) => part.type === type)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
}
