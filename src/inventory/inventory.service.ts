import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Prisma,
  StockMovementDirection,
  StockMovementType,
  StockLocationType,
  UnitConversionMode,
  UnitDimension,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateItemConversionDto,
  CreateItemDto,
  CreateLocationDto,
  CreateUnitDto,
  ListBalancesDto,
  ListItemsDto,
  ListLocationsDto,
  ListMovementsDto,
  ListUnitsDto,
  PostOpeningBalancesDto,
  UpdateItemDto,
  UpdateLocationDto,
} from './inventory.dto';
import { InventoryLedgerService } from './inventory-ledger.service';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: InventoryLedgerService,
  ) {}

  async listLocations(tenantId: string, query: ListLocationsDto) {
    const search = query.search?.trim();
    const where: Prisma.StockLocationWhereInput = {
      tenantId,
      type: query.type,
      isActive: query.status ? query.status === 'ACTIVE' : undefined,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { code: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const orderBy = {
      [query.sortBy]: query.sortOrder,
    } as Prisma.StockLocationOrderByWithRelationInput;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.stockLocation.findMany({
        where,
        include: { outlet: { select: { id: true, name: true, code: true } } },
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.stockLocation.count({ where }),
    ]);
    return this.page(data, total, query.page, query.limit);
  }

  async createLocation(
    tenantId: string,
    actorId: string,
    dto: CreateLocationDto,
  ) {
    await this.validateLocationOutlet(tenantId, dto.type, dto.outletId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const location = await tx.stockLocation.create({
          data: {
            tenantId,
            outletId: dto.outletId,
            name: dto.name.trim(),
            code: dto.code.trim().toUpperCase(),
            type: dto.type,
            isActive: dto.isActive,
          },
        });
        await this.audit(
          tx,
          tenantId,
          actorId,
          'LOCATION_CREATED',
          'StockLocation',
          location.id,
          dto,
        );
        return location;
      });
    } catch (error) {
      this.handleUnique(error, 'Location code already exists');
      throw error;
    }
  }

  async updateLocation(
    tenantId: string,
    actorId: string,
    id: string,
    dto: UpdateLocationDto,
  ) {
    const current = await this.requireLocation(tenantId, id);
    const type = dto.type ?? current.type;
    const outletId = dto.outletId ?? current.outletId ?? undefined;
    await this.validateLocationOutlet(tenantId, type, outletId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const location = await tx.stockLocation.update({
          where: { id },
          data: {
            outletId,
            name: dto.name?.trim(),
            code: dto.code?.trim().toUpperCase(),
            type: dto.type,
            isActive: dto.isActive,
          },
        });
        await this.audit(
          tx,
          tenantId,
          actorId,
          'LOCATION_UPDATED',
          'StockLocation',
          id,
          dto,
        );
        return location;
      });
    } catch (error) {
      this.handleUnique(error, 'Location code already exists');
      throw error;
    }
  }

  async listUnits(tenantId: string, query: ListUnitsDto) {
    const search = query.search?.trim();
    const where: Prisma.InventoryUnitWhereInput = {
      tenantId,
      dimension: query.dimension,
      isActive: query.status ? query.status === 'ACTIVE' : undefined,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { code: { contains: search, mode: 'insensitive' } },
              { symbol: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const orderBy = {
      [query.sortBy]: query.sortOrder,
    } as Prisma.InventoryUnitOrderByWithRelationInput;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.inventoryUnit.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.inventoryUnit.count({ where }),
    ]);
    return this.page(data, total, query.page, query.limit);
  }

  async createUnit(tenantId: string, actorId: string, dto: CreateUnitDto) {
    const factor = new Prisma.Decimal(dto.factorToDimensionBase);
    if (factor.lte(0))
      throw new UnprocessableEntityException(
        'Unit factor must be greater than zero',
      );
    if (dto.isBase && !factor.equals(1))
      throw new UnprocessableEntityException('A base unit must have factor 1');
    if (dto.isBase) {
      const existing = await this.prisma.inventoryUnit.findFirst({
        where: { tenantId, dimension: dto.dimension, isBase: true },
      });
      if (existing)
        throw new ConflictException(
          'A base unit already exists for this dimension',
        );
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const unit = await tx.inventoryUnit.create({
          data: {
            tenantId,
            code: dto.code.trim().toLowerCase(),
            name: dto.name.trim(),
            symbol: dto.symbol.trim(),
            dimension: dto.dimension,
            isBase: dto.isBase,
            factorToDimensionBase: factor,
            precision: dto.precision,
          },
        });
        await this.audit(
          tx,
          tenantId,
          actorId,
          'UNIT_CREATED',
          'InventoryUnit',
          unit.id,
          dto,
        );
        return unit;
      });
    } catch (error) {
      this.handleUnique(error, 'Unit code already exists');
      throw error;
    }
  }

  async listItems(tenantId: string, query: ListItemsDto) {
    const search = query.search?.trim();
    const where: Prisma.InventoryItemWhereInput = {
      tenantId,
      type: query.type,
      isActive: query.status ? query.status === 'ACTIVE' : undefined,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const orderBy = {
      [query.sortBy]: query.sortOrder,
    } as Prisma.InventoryItemOrderByWithRelationInput;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.inventoryItem.findMany({
        where,
        include: { baseUnit: true, _count: { select: { conversions: true } } },
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.inventoryItem.count({ where }),
    ]);
    return this.page(data, total, query.page, query.limit);
  }

  async findItem(tenantId: string, id: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id, tenantId },
      include: {
        baseUnit: true,
        conversions: {
          include: { unit: true },
          orderBy: { validFrom: 'desc' },
        },
      },
    });
    if (!item) throw new NotFoundException('Inventory item not found');
    return item;
  }

  async createItem(tenantId: string, actorId: string, dto: CreateItemDto) {
    await this.requireBaseUnit(tenantId, dto.baseUnitId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const item = await tx.inventoryItem.create({
          data: {
            tenantId,
            sku: dto.sku.trim().toUpperCase(),
            name: dto.name.trim(),
            type: dto.type,
            baseUnitId: dto.baseUnitId,
            reorderPoint: new Prisma.Decimal(dto.reorderPoint),
            allowNegative: false,
            isActive: dto.isActive,
          },
          include: { baseUnit: true },
        });
        await this.audit(
          tx,
          tenantId,
          actorId,
          'ITEM_CREATED',
          'InventoryItem',
          item.id,
          dto,
        );
        return item;
      });
    } catch (error) {
      this.handleUnique(error, 'Inventory SKU already exists');
      throw error;
    }
  }

  async updateItem(
    tenantId: string,
    actorId: string,
    id: string,
    dto: UpdateItemDto,
  ) {
    const current = await this.findItem(tenantId, id);
    if (dto.baseUnitId && dto.baseUnitId !== current.baseUnitId) {
      await this.requireBaseUnit(tenantId, dto.baseUnitId);
      const used = await this.prisma.stockMovement.count({
        where: { tenantId, itemId: id },
      });
      if (used)
        throw new UnprocessableEntityException(
          'Base unit cannot change after stock movements exist',
        );
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const item = await tx.inventoryItem.update({
          where: { id },
          data: {
            name: dto.name?.trim(),
            sku: dto.sku?.trim().toUpperCase(),
            type: dto.type,
            baseUnitId: dto.baseUnitId,
            reorderPoint:
              dto.reorderPoint === undefined
                ? undefined
                : new Prisma.Decimal(dto.reorderPoint),
            isActive: dto.isActive,
          },
          include: { baseUnit: true },
        });
        await this.audit(
          tx,
          tenantId,
          actorId,
          'ITEM_UPDATED',
          'InventoryItem',
          id,
          dto,
        );
        return item;
      });
    } catch (error) {
      this.handleUnique(error, 'Inventory SKU already exists');
      throw error;
    }
  }

  async addConversion(
    tenantId: string,
    actorId: string,
    itemId: string,
    dto: CreateItemConversionDto,
  ) {
    const [item, unit] = await Promise.all([
      this.findItem(tenantId, itemId),
      this.prisma.inventoryUnit.findFirst({
        where: { id: dto.unitId, tenantId, isActive: true },
      }),
    ]);
    if (!unit) throw new NotFoundException('Inventory unit not found');
    if (unit.id === item.baseUnitId)
      throw new UnprocessableEntityException(
        'Base unit conversion is always 1 and cannot be overridden',
      );
    this.validateConversion(item.baseUnit.dimension, unit.dimension, dto);
    const validFrom = dto.validFrom ? new Date(dto.validFrom) : new Date();
    return this.prisma.$transaction(async (tx) => {
      await tx.itemUnitConversion.updateMany({
        where: { tenantId, itemId, unitId: dto.unitId, validTo: null },
        data: { validTo: validFrom },
      });
      const conversion = await tx.itemUnitConversion.create({
        data: {
          tenantId,
          itemId,
          unitId: dto.unitId,
          mode: dto.mode,
          factorToBase: new Prisma.Decimal(dto.factorToBase),
          density: dto.density ? new Prisma.Decimal(dto.density) : null,
          notes: dto.notes?.trim(),
          validFrom,
        },
        include: { unit: true },
      });
      await this.audit(
        tx,
        tenantId,
        actorId,
        'CONVERSION_CREATED',
        'ItemUnitConversion',
        conversion.id,
        dto,
      );
      return conversion;
    });
  }

  async listBalances(
    tenantId: string,
    query: ListBalancesDto,
    showCost: boolean,
  ) {
    const search = query.search?.trim();
    const where: Prisma.StockBalanceWhereInput = {
      tenantId,
      locationId: query.locationId,
      itemId: query.itemId,
      ...(query.status === 'OUT' ? { quantity: { lte: 0 } } : {}),
      ...(search
        ? {
            item: {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { sku: { contains: search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };
    const orderBy = this.balanceOrder(query.sortBy, query.sortOrder);
    if (query.status === 'LOW') {
      const rows = await this.prisma.stockBalance.findMany({
        where,
        include: { item: { include: { baseUnit: true } }, location: true },
        orderBy,
      });
      const filtered = rows.filter(
        (row) => row.quantity.gt(0) && row.quantity.lte(row.item.reorderPoint),
      );
      const data = filtered.slice(
        (query.page - 1) * query.limit,
        query.page * query.limit,
      );
      return this.page(
        this.hideBalanceCost(data, showCost),
        filtered.length,
        query.page,
        query.limit,
      );
    }
    const [data, total] = await this.prisma.$transaction([
      this.prisma.stockBalance.findMany({
        where,
        include: { item: { include: { baseUnit: true } }, location: true },
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.stockBalance.count({ where }),
    ]);
    return this.page(
      this.hideBalanceCost(data, showCost),
      total,
      query.page,
      query.limit,
    );
  }

  async listMovements(
    tenantId: string,
    query: ListMovementsDto,
    showCost: boolean,
  ) {
    const search = query.search?.trim();
    const where: Prisma.StockMovementWhereInput = {
      tenantId,
      locationId: query.locationId,
      itemId: query.itemId,
      type: query.type,
      sourceType: query.sourceType,
      occurredAt:
        query.dateFrom || query.dateTo
          ? {
              gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
              lte: query.dateTo ? new Date(query.dateTo) : undefined,
            }
          : undefined,
      ...(search
        ? {
            OR: [
              { sourceId: { contains: search, mode: 'insensitive' } },
              { item: { name: { contains: search, mode: 'insensitive' } } },
              { item: { sku: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const orderBy = {
      [query.sortBy]: query.sortOrder,
    } as Prisma.StockMovementOrderByWithRelationInput;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where,
        include: {
          item: { include: { baseUnit: true } },
          location: true,
          actor: { select: { id: true, name: true } },
        },
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    if (showCost) return this.page(data, total, query.page, query.limit);
    const visible = data.map((movement) => ({
      ...movement,
      unitCost: undefined,
      amount: undefined,
    }));
    return this.page(visible, total, query.page, query.limit);
  }

  async overview(tenantId: string, showCost: boolean) {
    const [items, locations, balances, movementCount] = await Promise.all([
      this.prisma.inventoryItem.count({ where: { tenantId, isActive: true } }),
      this.prisma.stockLocation.count({ where: { tenantId, isActive: true } }),
      this.prisma.stockBalance.findMany({
        where: { tenantId },
        include: { item: { select: { reorderPoint: true } } },
      }),
      this.prisma.stockMovement.count({ where: { tenantId } }),
    ]);
    const totalValue = balances.reduce((sum, balance) => {
      if (!balance.averageUnitCost) return sum;
      return sum.plus(balance.quantity.mul(balance.averageUnitCost));
    }, new Prisma.Decimal(0));
    return {
      activeItems: items,
      activeLocations: locations,
      outOfStock: balances.filter((balance) => balance.quantity.lte(0)).length,
      lowStock: balances.filter(
        (balance) =>
          balance.quantity.gt(0) &&
          balance.quantity.lte(balance.item.reorderPoint),
      ).length,
      movementCount,
      ...(showCost ? { totalStockValue: totalValue } : {}),
      costCoverage: {
        complete: balances.every((balance) => balance.averageUnitCost !== null),
        totalBalances: balances.length,
        missingCosts: balances.filter(
          (balance) => balance.averageUnitCost === null,
        ).length,
      },
    };
  }

  async postOpeningBalances(
    tenantId: string,
    actorId: string,
    dto: PostOpeningBalancesDto,
  ) {
    const keys = dto.lines.map((line) => `${line.locationId}:${line.itemId}`);
    if (new Set(keys).size !== keys.length) {
      throw new UnprocessableEntityException(
        'Opening balance cannot contain duplicate location and item pairs',
      );
    }
    const ordered = [...dto.lines].sort((left, right) =>
      `${left.locationId}:${left.itemId}`.localeCompare(
        `${right.locationId}:${right.itemId}`,
      ),
    );
    return this.prisma.$transaction(
      async (tx) => {
        const movements = [];
        for (let index = 0; index < ordered.length; index += 1) {
          const line = ordered[index];
          const idempotencyKey = `opening:${dto.batchId}:${line.locationId}:${line.itemId}`;
          const replay = await tx.stockMovement.findUnique({
            where: {
              tenantId_idempotencyKey: { tenantId, idempotencyKey },
            },
          });
          if (!replay) {
            const previousMovements = await tx.stockMovement.count({
              where: {
                tenantId,
                locationId: line.locationId,
                itemId: line.itemId,
              },
            });
            if (previousMovements) {
              throw new ConflictException(
                `Opening balance is not allowed after movements exist for line ${index + 1}`,
              );
            }
          }
          movements.push(
            await this.ledger.post(tx, {
              tenantId,
              locationId: line.locationId,
              itemId: line.itemId,
              type: StockMovementType.OPENING_BALANCE,
              direction: StockMovementDirection.IN,
              quantity: line.quantity,
              unitCost: line.unitCost,
              incomingCostPolicy: line.unitCost ? 'REPLACE' : 'PRESERVE',
              sourceType: 'OPENING_BALANCE_BATCH',
              sourceId: dto.batchId,
              idempotencyKey,
              notes: line.notes?.trim(),
              actorId,
            }),
          );
        }
        return { batchId: dto.batchId, movements };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async validateLocationOutlet(
    tenantId: string,
    type: StockLocationType,
    outletId?: string,
  ) {
    if (
      (type === StockLocationType.OUTLET ||
        type === StockLocationType.KITCHEN) &&
      !outletId
    ) {
      throw new UnprocessableEntityException(
        'Outlet and kitchen locations require an outlet',
      );
    }
    if (
      outletId &&
      !(await this.prisma.outlet.findFirst({
        where: { id: outletId, tenantId },
      }))
    ) {
      throw new NotFoundException('Outlet not found in the active tenant');
    }
  }

  private async requireLocation(tenantId: string, id: string) {
    const location = await this.prisma.stockLocation.findFirst({
      where: { id, tenantId },
    });
    if (!location) throw new NotFoundException('Stock location not found');
    return location;
  }

  private async requireBaseUnit(tenantId: string, id: string) {
    const unit = await this.prisma.inventoryUnit.findFirst({
      where: { id, tenantId, isActive: true, isBase: true },
    });
    if (!unit) throw new NotFoundException('Active base unit not found');
    return unit;
  }

  private validateConversion(
    baseDimension: UnitDimension,
    unitDimension: UnitDimension,
    dto: CreateItemConversionDto,
  ) {
    const factor = new Prisma.Decimal(dto.factorToBase);
    if (factor.lte(0))
      throw new UnprocessableEntityException(
        'Conversion factor must be greater than zero',
      );
    if (
      dto.mode === UnitConversionMode.SAME_DIMENSION &&
      baseDimension !== unitDimension
    ) {
      throw new UnprocessableEntityException(
        'Cross-dimension conversion must use PACKAGING or DENSITY',
      );
    }
    if (dto.mode === UnitConversionMode.DENSITY) {
      const pair = new Set([baseDimension, unitDimension]);
      if (!pair.has(UnitDimension.MASS) || !pair.has(UnitDimension.VOLUME))
        throw new UnprocessableEntityException(
          'Density conversion is only valid between mass and volume',
        );
      if (!dto.density || new Prisma.Decimal(dto.density).lte(0))
        throw new UnprocessableEntityException(
          'A positive density is required',
        );
    }
  }

  private balanceOrder(sortBy: string, sortOrder: 'asc' | 'desc') {
    if (sortBy === 'name' || sortBy === 'sku') {
      return {
        item: { [sortBy]: sortOrder },
      } as Prisma.StockBalanceOrderByWithRelationInput;
    }
    return {
      [sortBy]: sortOrder,
    } as Prisma.StockBalanceOrderByWithRelationInput;
  }

  private hideBalanceCost<T extends { averageUnitCost: unknown }>(
    rows: T[],
    showCost: boolean,
  ) {
    if (showCost) return rows;
    return rows.map((balance) => ({
      ...balance,
      averageUnitCost: undefined,
    }));
  }

  private page<T>(data: T[], total: number, page: number, limit: number) {
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private audit(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorId: string,
    action: string,
    entityType: string,
    entityId: string,
    payload: object,
  ) {
    return tx.inventoryAuditEvent.create({
      data: {
        tenantId,
        actorId,
        action,
        entityType,
        entityId,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  }

  private handleUnique(error: unknown, message: string) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(message);
    }
  }
}
