import { Module } from '@nestjs/common';
import { InventoryAccessService } from './inventory-access.service';
import { InventoryController } from './inventory.controller';
import { InventoryPermissionsGuard } from './inventory-permissions.guard';
import { InventoryService } from './inventory.service';
import { InventoryLedgerService } from './inventory-ledger.service';
import { PurchaseReceiptsService } from './purchase-receipts.service';
import { StockAdjustmentsService } from './stock-adjustments.service';
import { StocktakesService } from './stocktakes.service';
import { MenuOptionConsumptionService } from './menu-option-consumption.service';
import { PrepService } from './prep.service';
import { StockRequestsService } from './stock-requests.service';
import { StockTransfersService } from './stock-transfers.service';

@Module({
  controllers: [InventoryController],
  providers: [
    InventoryService,
    InventoryAccessService,
    InventoryPermissionsGuard,
    InventoryLedgerService,
    PurchaseReceiptsService,
    StockAdjustmentsService,
    StocktakesService,
    MenuOptionConsumptionService,
    PrepService,
    StockTransfersService,
    StockRequestsService,
  ],
  exports: [
    InventoryService,
    InventoryAccessService,
    InventoryLedgerService,
    StockAdjustmentsService,
  ],
})
export class InventoryModule {}
