import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './settings.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}
  get() {
    return this.prisma.storeSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    });
  }
  async getBranding() {
    return (
      (await this.prisma.storeSettings.findUnique({
        where: { id: 'default' },
        select: { storeName: true, logoUrl: true, faviconUrl: true },
      })) ?? { storeName: 'Saung Sunja', logoUrl: null, faviconUrl: null }
    );
  }
  update(dto: UpdateSettingsDto) {
    return this.prisma.storeSettings.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
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
        address: dto.address?.trim(),
        phone: dto.phone?.trim(),
        currency: dto.currency?.trim().toUpperCase(),
        receiptHeader: dto.receiptHeader?.trim(),
        receiptFooter: dto.receiptFooter?.trim(),
      },
    });
  }
}
