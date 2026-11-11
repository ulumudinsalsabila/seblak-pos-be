import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigureOptionConsumptionDto } from './inventory.dto';

type MenuOptionGroup = {
  id: string;
  name: string;
  isActive?: boolean;
  categoryIds?: string[];
  values: { id: string; label: string }[];
};

const consumptionInclude = {
  location: { select: { id: true, name: true, code: true } },
  item: { include: { baseUnit: true } },
} satisfies Prisma.MenuOptionConsumptionInclude;

/** Ingredients consumed by the outlet's menu option values (toppings, spice levels, add-ons). */
@Injectable()
export class MenuOptionConsumptionService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, outletId: string) {
    const [groups, rows] = await Promise.all([
      this.groups(tenantId, outletId),
      this.prisma.menuOptionConsumption.findMany({
        where: { tenantId, outletId },
        include: consumptionInclude,
        orderBy: { item: { name: 'asc' } },
      }),
    ]);
    return {
      data: groups.map((group) => ({
        id: group.id,
        name: group.name,
        isActive: group.isActive !== false,
        categoryIds: group.categoryIds ?? [],
        values: group.values.map((value) => ({
          id: value.id,
          label: value.label,
          consumption: rows.filter(
            (row) => row.groupId === group.id && row.valueId === value.id,
          ),
        })),
      })),
      meta: null,
    };
  }

  async configure(
    tenantId: string,
    outletId: string,
    actorId: string,
    groupId: string,
    valueId: string,
    dto: ConfigureOptionConsumptionDto,
  ) {
    const groups = await this.groups(tenantId, outletId);
    const group = groups.find((candidate) => candidate.id === groupId);
    if (!group?.values.some((value) => value.id === valueId))
      throw new NotFoundException('Menu option not found');
    if (new Set(dto.lines.map((line) => line.itemId)).size !== dto.lines.length)
      throw new UnprocessableEntityException(
        'An option cannot consume the same item twice',
      );
    const lines = dto.lines.map((line, index) => {
      const quantity = new Prisma.Decimal(line.quantity);
      if (quantity.lte(0))
        throw new UnprocessableEntityException(
          `Quantity must be greater than zero for line ${index + 1}`,
        );
      return { itemId: line.itemId, quantity };
    });

    if (lines.length) {
      const [location, itemCount] = await Promise.all([
        this.prisma.stockLocation.findFirst({
          where: { id: dto.locationId, tenantId, outletId, isActive: true },
          select: { id: true },
        }),
        this.prisma.inventoryItem.count({
          where: {
            tenantId,
            isActive: true,
            id: { in: lines.map((line) => line.itemId) },
          },
        }),
      ]);
      if (!location)
        throw new NotFoundException('Active outlet stock location not found');
      if (itemCount !== lines.length)
        throw new NotFoundException('Active inventory item not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const where = { tenantId, outletId, groupId, valueId };
      await tx.menuOptionConsumption.deleteMany({ where });
      if (lines.length)
        await tx.menuOptionConsumption.createMany({
          data: lines.map((line) => ({
            ...where,
            locationId: dto.locationId!,
            ...line,
          })),
        });
      await tx.inventoryAuditEvent.create({
        data: {
          tenantId,
          actorId,
          action: 'MENU_OPTION_CONSUMPTION_CONFIGURED',
          entityType: 'MenuOptionValue',
          entityId: `${groupId}:${valueId}`,
          payload: { outletId, ...dto } as unknown as Prisma.InputJsonValue,
        },
      });
      return tx.menuOptionConsumption.findMany({
        where,
        include: consumptionInclude,
        orderBy: { item: { name: 'asc' } },
      });
    });
  }

  private async groups(tenantId: string, outletId: string) {
    const outlet = await this.prisma.outlet.findFirst({
      where: { id: outletId, tenantId },
      select: { settings: { select: { menuOptions: true } } },
    });
    if (!outlet) throw new NotFoundException('Outlet not found');
    const menuOptions = outlet.settings?.menuOptions;
    return Array.isArray(menuOptions)
      ? (menuOptions as unknown as MenuOptionGroup[])
      : [];
  }
}
