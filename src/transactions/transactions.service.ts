import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  FeeLedgerStatus,
  FeeLedgerType,
  FeeType,
  KitchenStatus,
  PaymentMethod,
  Prisma,
  ProductInventoryMode,
  StockMovementDirection,
  StockMovementType,
  TransactionStatus,
} from '@prisma/client';
import { jakartaRange } from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryLedgerService } from '../inventory/inventory-ledger.service';
import { StockAdjustmentsService } from '../inventory/stock-adjustments.service';
import {
  CreateTransactionDto,
  ListKitchenOrdersDto,
  ListTransactionsDto,
} from './transaction.dto';
import { calculateTotals } from './calculation';
import { calculatePlatformFee } from './fees';
import {
  ConsumptionPlan,
  optionConsumptionPlans,
  voidStockAction,
} from './sale-consumption';

type MenuOptionGroup = {
  id: string;
  name: string;
  isActive?: boolean;
  categoryIds: string[];
  values: { id: string; label: string }[];
};

const INT4_MAX = 2_147_483_647;

/** Cost is reporting-only: an out-of-range value is stored as unknown rather than blocking checkout. */
function costSubtotal(unitCost: number | null, quantity: number) {
  if (unitCost === null) return null;
  const value = unitCost * quantity;
  return value > INT4_MAX ? null : value;
}

const includeDetail = {
  items: true,
  cashier: { select: { id: true, name: true } },
  voidedBy: { select: { id: true, name: true } },
} as const;

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryLedger: InventoryLedgerService,
    private readonly stockAdjustments: StockAdjustmentsService,
  ) {}

  async create(outletId: string, cashierId: string, dto: CreateTransactionDto) {
    const existing = await this.prisma.transaction.findUnique({
      where: {
        outletId_clientTransactionId: {
          outletId,
          clientTransactionId: dto.clientTransactionId,
        },
      },
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
            where: {
              outletId_clientTransactionId: {
                outletId,
                clientTransactionId: dto.clientTransactionId,
              },
            },
            include: includeDetail,
          });
          if (duplicate) return duplicate;

          const [settings, products, outlet] = await Promise.all([
            tx.storeSettings.upsert({
              where: { outletId },
              create: { id: `outlet-${outletId}`, outletId },
              update: {},
            }),
            tx.product.findMany({
              where: {
                outletId,
                id: { in: dto.items.map((item) => item.productId) },
              },
              include: { category: true },
            }),
            tx.outlet.findUniqueOrThrow({
              where: { id: outletId },
              select: { tenantId: true },
            }),
          ]);
          const inventoryConfigs = await tx.productInventoryConfig.findMany({
            where: {
              tenantId: outlet.tenantId,
              productId: { in: products.map((product) => product.id) },
            },
            include: {
              activeRecipeVersion: { include: { lines: true } },
            },
          });
          const inventoryConfigMap = new Map(
            inventoryConfigs.map((config) => [config.productId, config]),
          );
          const productMap = new Map(
            products.map((product) => [product.id, product]),
          );
          const menuOptions = Array.isArray(settings.menuOptions)
            ? (settings.menuOptions as MenuOptionGroup[])
            : [];
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
            const applicableGroups = menuOptions.filter(
              (group) =>
                group.isActive !== false &&
                Array.isArray(group.categoryIds) &&
                group.categoryIds.includes(product.categoryId),
            );
            const selectedOptions = (item.selectedOptions ?? []).map(
              (selected) => {
                const group = applicableGroups.find(
                  (candidate) => candidate.id === selected.groupId,
                );
                const value = group?.values.find(
                  (candidate) => candidate.id === selected.valueId,
                );
                if (!group || !value)
                  throw new UnprocessableEntityException({
                    code: 'INVALID_MENU_OPTION',
                    message: `Opsi untuk ${product.name} tidak valid`,
                  });
                return {
                  groupId: group.id,
                  groupName: group.name,
                  valueId: value.id,
                  valueLabel: value.label,
                };
              },
            );
            if (
              new Set(selectedOptions.map((selected) => selected.groupId))
                .size !== selectedOptions.length
            )
              throw new UnprocessableEntityException({
                code: 'INVALID_MENU_OPTION',
                message: `Grup opsi untuk ${product.name} tidak boleh duplikat`,
              });
            const subtotal = product.price * item.quantity;
            if (!Number.isSafeInteger(subtotal) || subtotal > 2_000_000_000)
              throw new UnprocessableEntityException(
                'Item subtotal exceeds transaction limit',
              );
            return {
              product,
              quantity: item.quantity,
              subtotal,
              spicyLevel: item.spicyLevel ?? dto.spicyLevel,
              brothLevel: item.brothLevel ?? dto.brothLevel,
              tastePreference: item.tastePreference ?? dto.tastePreference,
              notes: item.notes?.trim() || null,
              selectedOptions,
            };
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
            if (inventoryConfigMap.has(line.product.id)) continue;
            if (!line.product.trackStock) continue;
            const updated = await tx.product.updateMany({
              where: {
                id: line.product.id,
                outletId,
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
            where: {
              outletId_businessDate: {
                outletId,
                businessDate: new Date(`${businessDate}T00:00:00.000Z`),
              },
            },
            create: {
              outletId,
              businessDate: new Date(`${businessDate}T00:00:00.000Z`),
              lastSequence: 1,
            },
            update: { lastSequence: { increment: 1 } },
          });
          const invoiceNo = `SBL-${businessDate.replaceAll('-', '')}-${String(counter.lastSequence).padStart(4, '0')}`;

          const now = new Date();
          const feeConfig = await tx.feeConfig.findFirst({
            where: {
              outletId,
              effectiveFrom: { lte: now },
              OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
            },
            orderBy: { effectiveFrom: 'desc' },
          });
          const feeType = feeConfig?.type ?? FeeType.NONE;
          const fee = calculatePlatformFee(
            total,
            feeType,
            feeConfig?.fixedAmount ?? 0,
            Number(feeConfig?.percentage ?? 0),
          );

          const created = await tx.transaction.create({
            data: {
              outletId,
              clientTransactionId: dto.clientTransactionId,
              invoiceNo,
              cashierId,
              subtotal,
              discount: dto.discount,
              tax,
              taxPercentage,
              total,
              platformFeeType: feeType,
              platformFeeFixed: fee.fixedFee,
              platformFeePercentage: fee.percentage,
              platformFeeAmount: fee.amount,
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
                  outletId,
                  productId: line.product.id,
                  productName: line.product.name,
                  categoryId: line.product.category.id,
                  categoryName: line.product.category.name,
                  sku: line.product.sku,
                  pricingType: line.product.pricingType,
                  trackStock: line.product.trackStock,
                  unitPrice: line.product.price,
                  unitCost: line.product.unitCost,
                  quantity: line.quantity,
                  subtotal: line.subtotal,
                  costSubtotal: costSubtotal(
                    line.product.unitCost,
                    line.quantity,
                  ),
                  spicyLevel: line.spicyLevel,
                  brothLevel: line.brothLevel,
                  tastePreference: line.tastePreference,
                  notes: line.notes,
                  selectedOptions: line.selectedOptions ?? Prisma.JsonNull,
                })),
              },
            },
            include: includeDetail,
          });
          const createdItemMap = new Map(
            created.items
              .filter((item) => item.productId)
              .map((item) => [item.productId!, item]),
          );
          const movementPlans: ConsumptionPlan[] = lines.flatMap((line) => {
            const config = inventoryConfigMap.get(line.product.id);
            const transactionItem = createdItemMap.get(line.product.id);
            if (!config || !transactionItem) return [];
            const saleKey = (itemId: string) =>
              `sale:${created.id}:${transactionItem.id}:${itemId}`;
            if (
              config.mode === ProductInventoryMode.DIRECT &&
              config.directItemId &&
              config.directQuantity
            ) {
              return [
                {
                  locationId: config.locationId,
                  itemId: config.directItemId,
                  quantity: config.directQuantity.mul(line.quantity),
                  sourceType: 'SALE_DIRECT',
                  sourceId: transactionItem.id,
                  idempotencyKey: saleKey(config.directItemId),
                  notes: `Sale ${created.invoiceNo}`,
                },
              ];
            }
            if (
              config.mode === ProductInventoryMode.RECIPE &&
              config.activeRecipeVersion
            ) {
              return config.activeRecipeVersion.lines.map((recipeLine) => ({
                locationId: config.locationId,
                itemId: recipeLine.itemId,
                quantity: recipeLine.quantity.mul(line.quantity),
                sourceType: 'SALE_RECIPE',
                sourceId: transactionItem.id,
                idempotencyKey: saleKey(recipeLine.itemId),
                notes: `Sale ${created.invoiceNo}; recipe v${config.activeRecipeVersion!.version}`,
              }));
            }
            throw new UnprocessableEntityException(
              `Inventory configuration for ${line.product.name} is incomplete`,
            );
          });
          const selectedValueIds = [
            ...new Set(
              lines.flatMap((line) =>
                line.selectedOptions.map((option) => option.valueId),
              ),
            ),
          ];
          if (selectedValueIds.length) {
            const optionRows = await tx.menuOptionConsumption.findMany({
              where: {
                tenantId: outlet.tenantId,
                outletId,
                valueId: { in: selectedValueIds },
              },
            });
            movementPlans.push(
              ...optionConsumptionPlans(
                lines.flatMap((line) => {
                  const transactionItem = createdItemMap.get(line.product.id);
                  return transactionItem
                    ? [
                        {
                          transactionItemId: transactionItem.id,
                          quantity: line.quantity,
                          selectedOptions: line.selectedOptions,
                        },
                      ]
                    : [];
                }),
                optionRows,
                created.invoiceNo,
              ),
            );
          }
          movementPlans.sort((left, right) =>
            `${left.locationId}:${left.itemId}`.localeCompare(
              `${right.locationId}:${right.itemId}`,
            ),
          );
          for (const plan of movementPlans) {
            await this.inventoryLedger.post(tx, {
              tenantId: outlet.tenantId,
              locationId: plan.locationId,
              itemId: plan.itemId,
              type: StockMovementType.SALE_CONSUMED,
              direction: StockMovementDirection.OUT,
              quantity: plan.quantity,
              sourceType: plan.sourceType,
              sourceId: plan.sourceId,
              idempotencyKey: plan.idempotencyKey,
              notes: plan.notes,
              actorId: cashierId,
            });
          }
          if (fee.amount > 0) {
            await tx.feeLedger.create({
              data: {
                outletId,
                transactionId: created.id,
                type: FeeLedgerType.CHARGE,
                status: FeeLedgerStatus.PENDING,
                amount: fee.amount,
                description: `Fee transaksi ${invoiceNo}`,
              },
            });
          }
          return created;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const winner = await this.prisma.transaction.findUnique({
          where: {
            outletId_clientTransactionId: {
              outletId,
              clientTransactionId: dto.clientTransactionId,
            },
          },
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

  async list(outletId: string, query: ListTransactionsDto) {
    const safePage = query.page;
    const safeLimit = query.limit;
    const where: Prisma.TransactionWhereInput = {
      outletId,
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

  async find(outletId: string, id: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, outletId },
      include: includeDetail,
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    return transaction;
  }

  async kitchen(outletId: string, query: ListKitchenOrdersDto) {
    const completedRange =
      query.status === KitchenStatus.COMPLETED
        ? jakartaRange(this.businessDate(), this.businessDate())
        : undefined;
    return this.prisma.transaction.findMany({
      where: {
        outletId,
        status: TransactionStatus.PAID,
        kitchenStatus: query.status,
        kitchenCompletedAt: completedRange,
      },
      include: includeDetail,
      orderBy:
        query.status === KitchenStatus.PENDING
          ? { createdAt: 'asc' }
          : { kitchenCompletedAt: 'desc' },
      take: query.limit,
    });
  }

  async completeKitchenItem(
    outletId: string,
    transactionId: string,
    itemId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findFirst({
        where: { id: transactionId, outletId, status: TransactionStatus.PAID },
        select: { id: true },
      });
      if (!transaction) throw new NotFoundException('Kitchen order not found');

      const item = await tx.transactionItem.findFirst({
        where: { id: itemId, transactionId, outletId },
        select: { id: true },
      });
      if (!item) throw new NotFoundException('Kitchen order item not found');

      await tx.transactionItem.updateMany({
        where: {
          id: itemId,
          transactionId,
          outletId,
          kitchenStatus: KitchenStatus.PENDING,
        },
        data: {
          kitchenStatus: KitchenStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
      const remaining = await tx.transactionItem.count({
        where: {
          transactionId,
          outletId,
          kitchenStatus: KitchenStatus.PENDING,
        },
      });
      if (remaining === 0) {
        await tx.transaction.update({
          where: { id: transactionId },
          data: {
            kitchenStatus: KitchenStatus.COMPLETED,
            kitchenCompletedAt: new Date(),
          },
        });
      }
      return tx.transaction.findUniqueOrThrow({
        where: { id: transactionId },
        include: includeDetail,
      });
    });
  }

  async completeKitchenOrder(outletId: string, transactionId: string) {
    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findFirst({
        where: { id: transactionId, outletId, status: TransactionStatus.PAID },
        select: { id: true },
      });
      if (!transaction) throw new NotFoundException('Kitchen order not found');
      const completedAt = new Date();
      await tx.transactionItem.updateMany({
        where: {
          transactionId,
          outletId,
          kitchenStatus: KitchenStatus.PENDING,
        },
        data: { kitchenStatus: KitchenStatus.COMPLETED, completedAt },
      });
      return tx.transaction.update({
        where: { id: transactionId },
        data: {
          kitchenStatus: KitchenStatus.COMPLETED,
          kitchenCompletedAt: completedAt,
        },
        include: includeDetail,
      });
    });
  }

  async void(outletId: string, id: string, ownerId: string, reason: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const transaction = await tx.transaction.findFirst({
          where: { id, outletId },
          include: { items: true, outlet: { select: { tenantId: true } } },
        });
        if (!transaction) throw new NotFoundException('Transaction not found');
        const changed = await tx.transaction.updateMany({
          where: { id, outletId, status: TransactionStatus.PAID },
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
        const tenantId = transaction.outlet.tenantId;
        const consumed = await tx.stockMovement.findMany({
          where: {
            tenantId,
            sourceId: { in: transaction.items.map((item) => item.id) },
            type: StockMovementType.SALE_CONSUMED,
            sourceType: { in: ['SALE_DIRECT', 'SALE_RECIPE', 'SALE_OPTION'] },
          },
          orderBy: [{ locationId: 'asc' }, { itemId: 'asc' }],
        });
        // Completed dishes' ingredients become waste, grouped into one document per stock location.
        const wasteByLocation = new Map<string, typeof consumed>();
        for (const item of transaction.items) {
          const inventoryMovements = consumed.filter(
            (movement) => movement.sourceId === item.id,
          );
          for (const movement of inventoryMovements) {
            if (
              voidStockAction(movement.sourceType, item.kitchenStatus) ===
              'WASTE'
            ) {
              wasteByLocation.set(movement.locationId, [
                ...(wasteByLocation.get(movement.locationId) ?? []),
                movement,
              ]);
              continue;
            }
            await this.inventoryLedger.post(tx, {
              tenantId,
              locationId: movement.locationId,
              itemId: movement.itemId,
              type: StockMovementType.SALE_REVERSED,
              direction: StockMovementDirection.IN,
              quantity: movement.quantity,
              unitCost: movement.unitCost,
              incomingCostPolicy: 'PRESERVE',
              sourceType:
                movement.sourceType === 'SALE_DIRECT'
                  ? 'SALE_DIRECT_VOID'
                  : 'SALE_VOID',
              sourceId: item.id,
              idempotencyKey: `sale-void:${movement.id}`,
              notes: `Void transaction ${transaction.invoiceNo}`,
              actorId: ownerId,
            });
          }
          if (inventoryMovements.length > 0) continue;
          if (item.trackStock && item.productId) {
            const restored = await tx.product.updateMany({
              where: { id: item.productId, outletId },
              data: { stock: { increment: item.quantity } },
            });
            if (restored.count !== 1)
              throw new ConflictException(
                'Tracked product could not be restored',
              );
          }
        }
        for (const [locationId, movements] of wasteByLocation) {
          await this.stockAdjustments.recordVoidedOrderWaste(tx, {
            tenantId,
            actorId: ownerId,
            locationId,
            invoiceNo: transaction.invoiceNo,
            voidReason: reason.trim(),
            consumed: movements,
          });
        }
        if (transaction.platformFeeAmount > 0) {
          await tx.feeLedger.create({
            data: {
              outletId,
              transactionId: transaction.id,
              type: FeeLedgerType.REVERSAL,
              status: FeeLedgerStatus.PENDING,
              amount: -transaction.platformFeeAmount,
              description: `Reversal fee transaksi ${transaction.invoiceNo}`,
            },
          });
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
