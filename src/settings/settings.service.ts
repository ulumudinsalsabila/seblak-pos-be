import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './settings.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}
  get(outletId: string) {
    return this.prisma.storeSettings.upsert({
      where: { outletId },
      create: { id: `outlet-${outletId}`, outletId },
      update: {},
    });
  }
  async getBranding(outletCode?: string) {
    if (!outletCode) {
      return {
        storeName: 'DagoraApp',
        logoUrl: null,
        faviconUrl: null,
        primaryColor: '#0B63F6',
      };
    }
    return (
      (await this.prisma.storeSettings.findFirst({
        where: {
          outlet: {
            status: 'ACTIVE',
            code: outletCode,
          },
        },
        select: {
          storeName: true,
          logoUrl: true,
          faviconUrl: true,
          primaryColor: true,
        },
      })) ?? {
        storeName: 'DagoraApp',
        logoUrl: null,
        faviconUrl: null,
        primaryColor: '#0B63F6',
      }
    );
  }
  async update(outletId: string, dto: UpdateSettingsDto) {
    if (dto.menuOptions) {
      const groupIds = dto.menuOptions.map((group) => group.id);
      if (new Set(groupIds).size !== groupIds.length) {
        throw new UnprocessableEntityException('ID grup opsi tidak boleh duplikat');
      }
      for (const group of dto.menuOptions) {
        if (new Set(group.categoryIds).size !== group.categoryIds.length)
          throw new UnprocessableEntityException(`Kategori pada opsi ${group.name} tidak boleh duplikat`);
        const valueIds = group.values.map((value) => value.id);
        if (new Set(valueIds).size !== valueIds.length)
          throw new UnprocessableEntityException(`ID nilai pada opsi ${group.name} tidak boleh duplikat`);
        if (group.values.filter((value) => value.isDefault).length > 1)
          throw new UnprocessableEntityException(`Opsi ${group.name} hanya boleh punya satu nilai default`);
      }
      const categoryIds = [...new Set(dto.menuOptions.flatMap((group) => group.categoryIds))];
      const categoryCount = await this.prisma.category.count({
        where: { outletId, id: { in: categoryIds } },
      });
      if (categoryCount !== categoryIds.length)
        throw new UnprocessableEntityException('Terdapat kategori opsi yang tidak valid');
    }
    const { menuOptions, ...settings } = dto;
    const menuOptionsData = menuOptions as Prisma.InputJsonValue | undefined;
    return this.prisma.storeSettings.upsert({
      where: { outletId },
      create: {
        id: `outlet-${outletId}`,
        outletId,
        ...settings,
        menuOptions: menuOptionsData,
        storeName: dto.storeName?.trim() ?? 'Saung Sunja',
      },
      update: {
        ...settings,
        menuOptions: menuOptionsData,
        storeName: dto.storeName?.trim(),
        logoUrl:
          dto.logoUrl === undefined ? undefined : dto.logoUrl?.trim() || null,
        faviconUrl:
          dto.faviconUrl === undefined
            ? undefined
            : dto.faviconUrl?.trim() || null,
        primaryColor: dto.primaryColor?.toUpperCase(),
        address: dto.address?.trim(),
        phone: dto.phone?.trim(),
        currency: dto.currency?.trim().toUpperCase(),
        receiptHeader: dto.receiptHeader?.trim(),
        receiptFooter: dto.receiptFooter?.trim(),
      },
    });
  }
}
