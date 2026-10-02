import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './settings.dto';

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
  update(outletId: string, dto: UpdateSettingsDto) {
    return this.prisma.storeSettings.upsert({
      where: { outletId },
      create: {
        id: `outlet-${outletId}`,
        outletId,
        ...dto,
        storeName: dto.storeName?.trim() ?? 'Saung Sunja',
      },
      update: {
        ...dto,
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
