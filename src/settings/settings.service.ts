import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto, UpdateTenantThemeDto } from './settings.dto';
import { Prisma } from '@prisma/client';

const DEFAULT_THEME = {
  primaryColor: '#C2410C',
  logoUrl: null as string | null,
  faviconUrl: null as string | null,
};

const themeSelect = {
  primaryColor: true,
  logoUrl: true,
  faviconUrl: true,
  updatedAt: true,
} as const;

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

  /**
   * Tenant branding. Tenants without a saved theme fall back to their oldest
   * outlet's settings, then to the app default, so branding never disappears.
   */
  async getTenantTheme(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        theme: { select: themeSelect },
        outlets: {
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: {
            settings: {
              select: { primaryColor: true, logoUrl: true, faviconUrl: true },
            },
          },
        },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const fallback = tenant.outlets[0]?.settings ?? DEFAULT_THEME;
    const theme = tenant.theme ?? { ...fallback, updatedAt: null };
    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      primaryColor: theme.primaryColor,
      logoUrl: theme.logoUrl,
      faviconUrl: theme.faviconUrl,
      updatedAt: theme.updatedAt,
    };
  }

  async updateTenantTheme(tenantId: string, dto: UpdateTenantThemeDto) {
    const url = (value: string | null | undefined) =>
      value === undefined ? undefined : value?.trim() || null;
    const changes = {
      primaryColor: dto.primaryColor?.toUpperCase(),
      logoUrl: url(dto.logoUrl),
      faviconUrl: url(dto.faviconUrl),
    };
    const current = await this.getTenantTheme(tenantId);
    await this.prisma.tenantTheme.upsert({
      where: { tenantId },
      create: {
        tenantId,
        primaryColor: changes.primaryColor ?? current.primaryColor,
        logoUrl:
          changes.logoUrl === undefined ? current.logoUrl : changes.logoUrl,
        faviconUrl:
          changes.faviconUrl === undefined
            ? current.faviconUrl
            : changes.faviconUrl,
      },
      update: changes,
    });
    return this.getTenantTheme(tenantId);
  }

  async getBranding(outletCode?: string) {
    const fallback = { storeName: 'DagoraApp', ...DEFAULT_THEME };
    if (!outletCode) return fallback;
    const outlet = await this.prisma.outlet.findFirst({
      where: { status: 'ACTIVE', code: outletCode },
      select: {
        tenant: { select: { theme: { select: themeSelect } } },
        settings: {
          select: {
            storeName: true,
            logoUrl: true,
            faviconUrl: true,
            primaryColor: true,
          },
        },
      },
    });
    if (!outlet?.settings) return fallback;
    const theme = outlet.tenant.theme;
    return {
      storeName: outlet.settings.storeName,
      primaryColor: theme?.primaryColor ?? outlet.settings.primaryColor,
      logoUrl: theme ? theme.logoUrl : outlet.settings.logoUrl,
      faviconUrl: theme ? theme.faviconUrl : outlet.settings.faviconUrl,
    };
  }
  async update(outletId: string, dto: UpdateSettingsDto) {
    if (dto.menuOptions) {
      const groupIds = dto.menuOptions.map((group) => group.id);
      if (new Set(groupIds).size !== groupIds.length) {
        throw new UnprocessableEntityException(
          'ID grup opsi tidak boleh duplikat',
        );
      }
      for (const group of dto.menuOptions) {
        if (new Set(group.categoryIds).size !== group.categoryIds.length)
          throw new UnprocessableEntityException(
            `Kategori pada opsi ${group.name} tidak boleh duplikat`,
          );
        const valueIds = group.values.map((value) => value.id);
        if (new Set(valueIds).size !== valueIds.length)
          throw new UnprocessableEntityException(
            `ID nilai pada opsi ${group.name} tidak boleh duplikat`,
          );
        if (group.values.filter((value) => value.isDefault).length > 1)
          throw new UnprocessableEntityException(
            `Opsi ${group.name} hanya boleh punya satu nilai default`,
          );
      }
      const categoryIds = [
        ...new Set(dto.menuOptions.flatMap((group) => group.categoryIds)),
      ];
      const categoryCount = await this.prisma.category.count({
        where: { outletId, id: { in: categoryIds } },
      });
      if (categoryCount !== categoryIds.length)
        throw new UnprocessableEntityException(
          'Terdapat kategori opsi yang tidak valid',
        );
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
