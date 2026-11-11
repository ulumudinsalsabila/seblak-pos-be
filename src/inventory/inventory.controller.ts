import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InventoryPermission, StockAdjustmentKind } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { requireTenant } from '../common/tenant-context';
import { requireOutlet } from '../common/outlet-context';
import { InventoryAccessService } from './inventory-access.service';
import {
  ApproveStockRequestDto,
  CancelStocktakeDto,
  CompletePrepBatchDto,
  ConfigurePrepRecipeDto,
  ListPrepBatchesDto,
  StartPrepBatchDto,
  VoidPrepBatchDto,
  CreateItemConversionDto,
  ConfigureOptionConsumptionDto,
  ConfigureProductInventoryDto,
  CreateItemDto,
  CreateLocationDto,
  CreatePurchaseReceiptDto,
  CreateStockAdjustmentDto,
  CreateStockRequestDto,
  CreateStockTransferDto,
  CreateStocktakeDto,
  CreateUnitDto,
  FoodCostReportDto,
  ListBalancesDto,
  ListItemsDto,
  ListLocationsDto,
  ListMovementsDto,
  ListPurchaseReceiptsDto,
  ListStockAdjustmentsDto,
  ListStockRequestsDto,
  ListStockTransfersDto,
  ListStocktakesDto,
  ListUnitsDto,
  PostOpeningBalancesDto,
  ReasonDto,
  ReceiveStockTransferDto,
  RecordStocktakeCountsDto,
  ShipStockTransferDto,
  UpdateItemDto,
  UpdateLocationDto,
} from './inventory.dto';
import { InventoryPermissions } from './inventory-permissions';
import { InventoryPermissionsGuard } from './inventory-permissions.guard';
import { InventoryService } from './inventory.service';
import { PurchaseReceiptsService } from './purchase-receipts.service';
import { StockAdjustmentsService } from './stock-adjustments.service';
import { StocktakesService } from './stocktakes.service';
import { MenuOptionConsumptionService } from './menu-option-consumption.service';
import { PrepService } from './prep.service';
import { StockRequestsService } from './stock-requests.service';
import { StockTransfersService } from './stock-transfers.service';
import { InventoryReportsService } from './inventory-reports.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard, InventoryPermissionsGuard)
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly access: InventoryAccessService,
    private readonly purchases: PurchaseReceiptsService,
    private readonly adjustments: StockAdjustmentsService,
    private readonly stocktakes: StocktakesService,
    private readonly optionConsumption: MenuOptionConsumptionService,
    private readonly prep: PrepService,
    private readonly requests: StockRequestsService,
    private readonly transfers: StockTransfersService,
    private readonly reports: InventoryReportsService,
  ) {}

  private showCost(user: AuthUser) {
    return this.access.has(user, InventoryPermission.VIEW_INVENTORY_COST);
  }

  @Get('overview')
  @InventoryPermissions(InventoryPermission.VIEW_INVENTORY)
  async overview(@CurrentUser() user: AuthUser) {
    const showCost = await this.access.has(
      user,
      InventoryPermission.VIEW_INVENTORY_COST,
    );
    const tenantId = requireTenant(user);
    const [overview, inTransit] = await Promise.all([
      this.inventory.overview(tenantId, showCost),
      this.reports.inTransit(tenantId),
    ]);
    return {
      data: {
        ...overview,
        inTransit: {
          lines: inTransit.lines,
          ...(showCost ? { value: inTransit.value } : {}),
        },
      },
      meta: null,
    };
  }

  @Get('alerts')
  @InventoryPermissions(InventoryPermission.VIEW_INVENTORY)
  async alerts(@CurrentUser() user: AuthUser) {
    return {
      data: await this.reports.alerts(
        requireTenant(user),
        await this.showCost(user),
      ),
      meta: null,
    };
  }

  @Get('reports/food-cost')
  @InventoryPermissions(
    InventoryPermission.VIEW_INVENTORY,
    InventoryPermission.VIEW_INVENTORY_COST,
  )
  async foodCostReport(
    @CurrentUser() user: AuthUser,
    @Query() query: FoodCostReportDto,
  ) {
    return {
      data: await this.reports.foodCost(requireTenant(user), query),
      meta: null,
    };
  }

  @Get('locations')
  @InventoryPermissions(InventoryPermission.VIEW_INVENTORY)
  listLocations(
    @CurrentUser() user: AuthUser,
    @Query() query: ListLocationsDto,
  ) {
    return this.inventory.listLocations(requireTenant(user), query);
  }

  @Post('locations')
  @InventoryPermissions(InventoryPermission.MANAGE_INVENTORY_LOCATIONS)
  async createLocation(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateLocationDto,
  ) {
    return {
      data: await this.inventory.createLocation(
        requireTenant(user),
        user.id,
        dto,
      ),
      meta: null,
    };
  }

  @Patch('locations/:id')
  @InventoryPermissions(InventoryPermission.MANAGE_INVENTORY_LOCATIONS)
  async updateLocation(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return {
      data: await this.inventory.updateLocation(
        requireTenant(user),
        user.id,
        id,
        dto,
      ),
      meta: null,
    };
  }

  @Get('units')
  @InventoryPermissions(InventoryPermission.VIEW_INVENTORY)
  listUnits(@CurrentUser() user: AuthUser, @Query() query: ListUnitsDto) {
    return this.inventory.listUnits(requireTenant(user), query);
  }

  @Post('units')
  @InventoryPermissions(InventoryPermission.MANAGE_INVENTORY_ITEMS)
  async createUnit(@CurrentUser() user: AuthUser, @Body() dto: CreateUnitDto) {
    return {
      data: await this.inventory.createUnit(requireTenant(user), user.id, dto),
      meta: null,
    };
  }

  @Get('items')
  @InventoryPermissions(InventoryPermission.VIEW_INVENTORY)
  listItems(@CurrentUser() user: AuthUser, @Query() query: ListItemsDto) {
    return this.inventory.listItems(requireTenant(user), query);
  }

  @Get('items/:id')
  @InventoryPermissions(InventoryPermission.VIEW_INVENTORY)
  async findItem(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return {
      data: await this.inventory.findItem(requireTenant(user), id),
      meta: null,
    };
  }

  @Post('items')
  @InventoryPermissions(InventoryPermission.MANAGE_INVENTORY_ITEMS)
  async createItem(@CurrentUser() user: AuthUser, @Body() dto: CreateItemDto) {
    return {
      data: await this.inventory.createItem(requireTenant(user), user.id, dto),
      meta: null,
    };
  }

  @Patch('items/:id')
  @InventoryPermissions(InventoryPermission.MANAGE_INVENTORY_ITEMS)
  async updateItem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateItemDto,
  ) {
    return {
      data: await this.inventory.updateItem(
        requireTenant(user),
        user.id,
        id,
        dto,
      ),
      meta: null,
    };
  }

  @Post('items/:id/conversions')
  @InventoryPermissions(InventoryPermission.MANAGE_INVENTORY_ITEMS)
  async addConversion(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateItemConversionDto,
  ) {
    return {
      data: await this.inventory.addConversion(
        requireTenant(user),
        user.id,
        id,
        dto,
      ),
      meta: null,
    };
  }

  @Get('balances')
  @InventoryPermissions(InventoryPermission.VIEW_INVENTORY)
  async listBalances(
    @CurrentUser() user: AuthUser,
    @Query() query: ListBalancesDto,
  ) {
    const showCost = await this.access.has(
      user,
      InventoryPermission.VIEW_INVENTORY_COST,
    );
    return this.inventory.listBalances(requireTenant(user), query, showCost);
  }

  @Get('movements')
  @InventoryPermissions(InventoryPermission.VIEW_INVENTORY_LEDGER)
  async listMovements(
    @CurrentUser() user: AuthUser,
    @Query() query: ListMovementsDto,
  ) {
    const showCost = await this.access.has(
      user,
      InventoryPermission.VIEW_INVENTORY_COST,
    );
    return this.inventory.listMovements(requireTenant(user), query, showCost);
  }

  @Post('opening-balances')
  @InventoryPermissions(InventoryPermission.POST_INVENTORY_OPENING)
  async postOpeningBalances(
    @CurrentUser() user: AuthUser,
    @Body() dto: PostOpeningBalancesDto,
  ) {
    return {
      data: await this.inventory.postOpeningBalances(
        requireTenant(user),
        user.id,
        dto,
      ),
      meta: null,
    };
  }

  @Get('purchases')
  @InventoryPermissions(InventoryPermission.VIEW_INVENTORY)
  async listPurchases(
    @CurrentUser() user: AuthUser,
    @Query() query: ListPurchaseReceiptsDto,
  ) {
    const showCost = await this.access.has(
      user,
      InventoryPermission.VIEW_INVENTORY_COST,
    );
    return this.purchases.list(requireTenant(user), query, showCost);
  }

  @Post('purchases')
  @InventoryPermissions(InventoryPermission.RECEIVE_INVENTORY_PURCHASES)
  async createPurchase(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePurchaseReceiptDto,
  ) {
    return {
      data: await this.purchases.create(requireTenant(user), user.id, dto),
      meta: null,
    };
  }

  @Get('adjustments')
  @InventoryPermissions(InventoryPermission.VIEW_INVENTORY_LEDGER)
  async listAdjustments(
    @CurrentUser() user: AuthUser,
    @Query() query: ListStockAdjustmentsDto,
  ) {
    return this.adjustments.list(
      requireTenant(user),
      query,
      await this.showCost(user),
    );
  }

  @Post('waste')
  @InventoryPermissions(InventoryPermission.POST_INVENTORY_WASTE)
  async postWaste(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateStockAdjustmentDto,
  ) {
    return {
      data: await this.adjustments.create(
        requireTenant(user),
        user.id,
        StockAdjustmentKind.WASTE,
        dto,
        await this.showCost(user),
      ),
      meta: null,
    };
  }

  @Post('adjustments')
  @InventoryPermissions(InventoryPermission.POST_INVENTORY_ADJUSTMENTS)
  async postAdjustment(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateStockAdjustmentDto,
  ) {
    return {
      data: await this.adjustments.create(
        requireTenant(user),
        user.id,
        StockAdjustmentKind.ADJUSTMENT,
        dto,
        await this.showCost(user),
      ),
      meta: null,
    };
  }

  @Get('stocktakes')
  @InventoryPermissions(InventoryPermission.COUNT_INVENTORY_STOCKTAKE)
  listStocktakes(
    @CurrentUser() user: AuthUser,
    @Query() query: ListStocktakesDto,
  ) {
    return this.stocktakes.list(requireTenant(user), query);
  }

  @Get('stocktakes/:id')
  @InventoryPermissions(InventoryPermission.COUNT_INVENTORY_STOCKTAKE)
  async findStocktake(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return {
      data: await this.stocktakes.findOne(
        requireTenant(user),
        id,
        await this.showCost(user),
      ),
      meta: null,
    };
  }

  @Post('stocktakes')
  @InventoryPermissions(InventoryPermission.COUNT_INVENTORY_STOCKTAKE)
  async createStocktake(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateStocktakeDto,
  ) {
    return {
      data: await this.stocktakes.create(requireTenant(user), user.id, dto),
      meta: null,
    };
  }

  @Put('stocktakes/:id/counts')
  @InventoryPermissions(InventoryPermission.COUNT_INVENTORY_STOCKTAKE)
  async recordStocktakeCounts(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordStocktakeCountsDto,
  ) {
    return {
      data: await this.stocktakes.recordCounts(
        requireTenant(user),
        user.id,
        id,
        dto,
        await this.showCost(user),
      ),
      meta: null,
    };
  }

  @Delete('stocktakes/:id/counts/:itemId')
  @InventoryPermissions(InventoryPermission.COUNT_INVENTORY_STOCKTAKE)
  async removeStocktakeCount(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return {
      data: await this.stocktakes.removeCount(
        requireTenant(user),
        user.id,
        id,
        itemId,
        await this.showCost(user),
      ),
      meta: null,
    };
  }

  @Post('stocktakes/:id/submit')
  @InventoryPermissions(InventoryPermission.COUNT_INVENTORY_STOCKTAKE)
  async submitStocktake(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return {
      data: await this.stocktakes.submit(
        requireTenant(user),
        user.id,
        id,
        await this.showCost(user),
      ),
      meta: null,
    };
  }

  @Post('stocktakes/:id/reopen')
  @InventoryPermissions(InventoryPermission.APPROVE_INVENTORY_STOCKTAKE)
  async reopenStocktake(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return {
      data: await this.stocktakes.reopen(
        requireTenant(user),
        user.id,
        id,
        await this.showCost(user),
      ),
      meta: null,
    };
  }

  @Post('stocktakes/:id/approve')
  @InventoryPermissions(InventoryPermission.APPROVE_INVENTORY_STOCKTAKE)
  async approveStocktake(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return {
      data: await this.stocktakes.approve(
        requireTenant(user),
        user.id,
        id,
        await this.showCost(user),
      ),
      meta: null,
    };
  }

  @Post('stocktakes/:id/cancel')
  @InventoryPermissions(InventoryPermission.COUNT_INVENTORY_STOCKTAKE)
  async cancelStocktake(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelStocktakeDto,
  ) {
    return {
      data: await this.stocktakes.cancel(
        requireTenant(user),
        user.id,
        id,
        dto,
        await this.showCost(user),
      ),
      meta: null,
    };
  }

  @Get('reconciliation')
  @InventoryPermissions(InventoryPermission.VIEW_INVENTORY_LEDGER)
  async reconciliation(@CurrentUser() user: AuthUser) {
    return {
      data: await this.purchases.reconciliation(requireTenant(user)),
      meta: null,
    };
  }

  @Get('requests')
  @InventoryPermissions(InventoryPermission.VIEW_INVENTORY)
  listStockRequests(
    @CurrentUser() user: AuthUser,
    @Query() query: ListStockRequestsDto,
  ) {
    return this.requests.list(requireTenant(user), query);
  }

  @Get('requests/:id')
  @InventoryPermissions(InventoryPermission.VIEW_INVENTORY)
  async findStockRequest(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return {
      data: await this.requests.findOne(requireTenant(user), id),
      meta: null,
    };
  }

  @Post('requests')
  @InventoryPermissions(InventoryPermission.REQUEST_INVENTORY_STOCK)
  async createStockRequest(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateStockRequestDto,
  ) {
    return {
      data: await this.requests.create(requireTenant(user), user.id, dto),
      meta: null,
    };
  }

  @Post('requests/:id/approve')
  @InventoryPermissions(InventoryPermission.APPROVE_INVENTORY_TRANSFERS)
  async approveStockRequest(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveStockRequestDto,
  ) {
    return {
      data: await this.requests.approve(requireTenant(user), user.id, id, dto),
      meta: null,
    };
  }

  @Post('requests/:id/reject')
  @InventoryPermissions(InventoryPermission.APPROVE_INVENTORY_TRANSFERS)
  async rejectStockRequest(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonDto,
  ) {
    return {
      data: await this.requests.reject(requireTenant(user), user.id, id, dto),
      meta: null,
    };
  }

  @Post('requests/:id/cancel')
  @InventoryPermissions(InventoryPermission.REQUEST_INVENTORY_STOCK)
  async cancelStockRequest(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return {
      data: await this.requests.cancel(requireTenant(user), user.id, id),
      meta: null,
    };
  }

  @Get('transfers')
  @InventoryPermissions(InventoryPermission.VIEW_INVENTORY)
  async listStockTransfers(
    @CurrentUser() user: AuthUser,
    @Query() query: ListStockTransfersDto,
  ) {
    return this.transfers.list(
      requireTenant(user),
      query,
      await this.showCost(user),
    );
  }

  @Get('transfers/:id')
  @InventoryPermissions(InventoryPermission.VIEW_INVENTORY)
  async findStockTransfer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return {
      data: await this.transfers.findOne(
        requireTenant(user),
        id,
        await this.showCost(user),
      ),
      meta: null,
    };
  }

  @Post('transfers')
  @InventoryPermissions(InventoryPermission.APPROVE_INVENTORY_TRANSFERS)
  async createStockTransfer(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateStockTransferDto,
  ) {
    return {
      data: await this.transfers.create(
        requireTenant(user),
        user.id,
        dto,
        await this.showCost(user),
      ),
      meta: null,
    };
  }

  @Post('transfers/:id/ship')
  @InventoryPermissions(InventoryPermission.SHIP_INVENTORY_TRANSFERS)
  async shipStockTransfer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ShipStockTransferDto,
  ) {
    return {
      data: await this.transfers.ship(
        requireTenant(user),
        user.id,
        id,
        dto,
        await this.showCost(user),
      ),
      meta: null,
    };
  }

  @Post('transfers/:id/receive')
  @InventoryPermissions(InventoryPermission.RECEIVE_INVENTORY_TRANSFERS)
  async receiveStockTransfer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceiveStockTransferDto,
  ) {
    return {
      data: await this.transfers.receive(
        requireTenant(user),
        user.id,
        id,
        dto,
        await this.showCost(user),
      ),
      meta: null,
    };
  }

  @Post('transfers/:id/close')
  @InventoryPermissions(InventoryPermission.APPROVE_INVENTORY_TRANSFERS)
  async closeStockTransfer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonDto,
  ) {
    return {
      data: await this.transfers.close(
        requireTenant(user),
        user.id,
        id,
        dto,
        await this.showCost(user),
      ),
      meta: null,
    };
  }

  @Post('transfers/:id/cancel')
  @InventoryPermissions(InventoryPermission.APPROVE_INVENTORY_TRANSFERS)
  async cancelStockTransfer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonDto,
  ) {
    return {
      data: await this.transfers.cancel(
        requireTenant(user),
        user.id,
        id,
        dto,
        await this.showCost(user),
      ),
      meta: null,
    };
  }

  @Get('prep-recipes')
  @InventoryPermissions(InventoryPermission.VIEW_INVENTORY)
  listPrepRecipes(@CurrentUser() user: AuthUser) {
    return this.prep.listRecipes(requireTenant(user));
  }

  @Put('prep-recipes/:outputItemId')
  @InventoryPermissions(InventoryPermission.MANAGE_INVENTORY_RECIPES)
  async configurePrepRecipe(
    @CurrentUser() user: AuthUser,
    @Param('outputItemId', ParseUUIDPipe) outputItemId: string,
    @Body() dto: ConfigurePrepRecipeDto,
  ) {
    return {
      data: await this.prep.configureRecipe(
        requireTenant(user),
        user.id,
        outputItemId,
        dto,
      ),
      meta: null,
    };
  }

  @Get('prep-batches')
  @InventoryPermissions(InventoryPermission.VIEW_INVENTORY)
  async listPrepBatches(
    @CurrentUser() user: AuthUser,
    @Query() query: ListPrepBatchesDto,
  ) {
    return this.prep.listBatches(
      requireTenant(user),
      query,
      await this.showCost(user),
    );
  }

  @Get('prep-batches/:id')
  @InventoryPermissions(InventoryPermission.VIEW_INVENTORY)
  async findPrepBatch(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return {
      data: await this.prep.findBatch(
        requireTenant(user),
        id,
        await this.showCost(user),
      ),
      meta: null,
    };
  }

  @Post('prep-batches')
  @InventoryPermissions(InventoryPermission.POST_INVENTORY_PREP)
  async startPrepBatch(
    @CurrentUser() user: AuthUser,
    @Body() dto: StartPrepBatchDto,
  ) {
    return {
      data: await this.prep.start(
        requireTenant(user),
        user.id,
        dto,
        await this.showCost(user),
      ),
      meta: null,
    };
  }

  @Post('prep-batches/:id/complete')
  @InventoryPermissions(InventoryPermission.POST_INVENTORY_PREP)
  async completePrepBatch(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompletePrepBatchDto,
  ) {
    return {
      data: await this.prep.complete(
        requireTenant(user),
        user.id,
        id,
        dto,
        await this.showCost(user),
      ),
      meta: null,
    };
  }

  @Post('prep-batches/:id/void')
  @InventoryPermissions(InventoryPermission.POST_INVENTORY_PREP)
  async voidPrepBatch(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidPrepBatchDto,
  ) {
    return {
      data: await this.prep.void(
        requireTenant(user),
        user.id,
        id,
        dto,
        await this.showCost(user),
      ),
      meta: null,
    };
  }

  @Get('menu-options')
  @InventoryPermissions(InventoryPermission.VIEW_INVENTORY)
  listMenuOptionConsumption(@CurrentUser() user: AuthUser) {
    return this.optionConsumption.list(
      requireTenant(user),
      requireOutlet(user),
    );
  }

  @Put('menu-options/:groupId/:valueId')
  @InventoryPermissions(InventoryPermission.MANAGE_INVENTORY_RECIPES)
  async configureMenuOptionConsumption(
    @CurrentUser() user: AuthUser,
    @Param('groupId') groupId: string,
    @Param('valueId') valueId: string,
    @Body() dto: ConfigureOptionConsumptionDto,
  ) {
    return {
      data: await this.optionConsumption.configure(
        requireTenant(user),
        requireOutlet(user),
        user.id,
        groupId,
        valueId,
        dto,
      ),
      meta: null,
    };
  }

  @Get('recipes')
  @InventoryPermissions(InventoryPermission.VIEW_INVENTORY)
  listRecipes(@CurrentUser() user: AuthUser) {
    return this.inventory.listProductInventory(
      requireTenant(user),
      requireOutlet(user),
    );
  }

  @Put('recipes/:productId')
  @InventoryPermissions(InventoryPermission.MANAGE_INVENTORY_RECIPES)
  async configureRecipe(
    @CurrentUser() user: AuthUser,
    @Param('productId') productId: string,
    @Body() dto: ConfigureProductInventoryDto,
  ) {
    return {
      data: await this.inventory.configureProductInventory(
        requireTenant(user),
        requireOutlet(user),
        user.id,
        productId,
        dto,
      ),
      meta: null,
    };
  }
}
