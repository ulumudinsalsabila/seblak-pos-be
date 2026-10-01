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
        address: dto.address?.trim(),
        phone: dto.phone?.trim(),
        currency: dto.currency?.trim().toUpperCase(),
        receiptHeader: dto.receiptHeader?.trim(),
        receiptFooter: dto.receiptFooter?.trim(),
      },
    });
  }
}
