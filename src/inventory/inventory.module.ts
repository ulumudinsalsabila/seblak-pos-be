import { Module } from '@nestjs/common';
import { InventoryAccessService } from './inventory-access.service';
import { InventoryController } from './inventory.controller';
import { InventoryPermissionsGuard } from './inventory-permissions.guard';
import { InventoryService } from './inventory.service';
import { InventoryLedgerService } from './inventory-ledger.service';
import { PurchaseReceiptsService } from './purchase-receipts.service';

@Module({
  controllers: [InventoryController],
  providers: [
    InventoryService,
    InventoryAccessService,
    InventoryPermissionsGuard,
    InventoryLedgerService,
    PurchaseReceiptsService,
  ],
  exports: [InventoryService, InventoryAccessService, InventoryLedgerService],
})
export class InventoryModule {}
