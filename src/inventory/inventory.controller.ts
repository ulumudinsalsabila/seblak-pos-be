import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InventoryPermission } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { requireTenant } from '../common/tenant-context';
import { requireOutlet } from '../common/outlet-context';
import { InventoryAccessService } from './inventory-access.service';
import {
  CreateItemConversionDto,
  ConfigureProductInventoryDto,
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
import { InventoryPermissions } from './inventory-permissions';
import { InventoryPermissionsGuard } from './inventory-permissions.guard';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard, InventoryPermissionsGuard)
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly access: InventoryAccessService,
  ) {}

  @Get('overview')
  @InventoryPermissions(InventoryPermission.VIEW_INVENTORY)
  async overview(@CurrentUser() user: AuthUser) {
    const showCost = await this.access.has(
      user,
      InventoryPermission.VIEW_INVENTORY_COST,
    );
    return {
      data: await this.inventory.overview(requireTenant(user), showCost),
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
