import {
  InventoryItemType,
  PrepBatchStatus,
  ProductInventoryMode,
  StockAdjustmentKind,
  StockAdjustmentReason,
  StockLocationType,
  StockMovementDirection,
  StockMovementType,
  StockRequestStatus,
  StockTransferStatus,
  StocktakeStatus,
  UnitConversionMode,
  UnitDimension,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const QUANTITY_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/;
const COST_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;
const FACTOR_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,9})?$/;

export class InventoryPageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsIn(['asc', 'desc']) sortOrder: 'asc' | 'desc' = 'asc';
}

export class ListLocationsDto extends InventoryPageDto {
  @IsOptional() @IsEnum(StockLocationType) type?: StockLocationType;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
  @IsOptional() @IsIn(['name', 'code', 'type', 'createdAt']) sortBy = 'name';
}

export class CreateLocationDto {
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsString() @Matches(/^[A-Za-z0-9_-]+$/) @MaxLength(50) code!: string;
  @IsEnum(StockLocationType) type!: StockLocationType;
  @IsOptional() @IsUUID() outletId?: string;
  @IsOptional() @IsBoolean() isActive = true;
}

export class UpdateLocationDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) name?: string;
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]+$/)
  @MaxLength(50)
  code?: string;
  @IsOptional() @IsEnum(StockLocationType) type?: StockLocationType;
  @IsOptional() @IsUUID() outletId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ListUnitsDto extends InventoryPageDto {
  @IsOptional() @IsEnum(UnitDimension) dimension?: UnitDimension;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
  @IsOptional() @IsIn(['name', 'code', 'dimension', 'createdAt']) sortBy =
    'name';
}

export class CreateUnitDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]+$/) @MaxLength(30) code!: string;
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsString() @MinLength(1) @MaxLength(20) symbol!: string;
  @IsEnum(UnitDimension) dimension!: UnitDimension;
  @IsOptional() @IsBoolean() isBase = false;
  @IsOptional() @IsString() @Matches(FACTOR_PATTERN) factorToDimensionBase =
    '1';
  @IsOptional() @IsInt() @Min(0) @Max(6) precision = 3;
}

export class ListItemsDto extends InventoryPageDto {
  @IsOptional() @IsEnum(InventoryItemType) type?: InventoryItemType;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
  @IsOptional() @IsIn(['name', 'sku', 'type', 'createdAt']) sortBy = 'name';
}

export class CreateItemDto {
  @IsString() @MinLength(1) @MaxLength(150) name!: string;
  @IsString() @Matches(/^[A-Za-z0-9._-]+$/) @MaxLength(50) sku!: string;
  @IsEnum(InventoryItemType) type!: InventoryItemType;
  @IsUUID() baseUnitId!: string;
  @IsOptional() @IsString() @Matches(QUANTITY_PATTERN) reorderPoint = '0';
  @IsOptional() @IsBoolean() isActive = true;
}

export class UpdateItemDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(150) name?: string;
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9._-]+$/)
  @MaxLength(50)
  sku?: string;
  @IsOptional() @IsEnum(InventoryItemType) type?: InventoryItemType;
  @IsOptional() @IsUUID() baseUnitId?: string;
  @IsOptional() @IsString() @Matches(QUANTITY_PATTERN) reorderPoint?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateItemConversionDto {
  @IsUUID() unitId!: string;
  @IsEnum(UnitConversionMode) mode!: UnitConversionMode;
  @IsString() @Matches(FACTOR_PATTERN) factorToBase!: string;
  @ValidateIf(
    (dto: CreateItemConversionDto) => dto.mode === UnitConversionMode.DENSITY,
  )
  @IsString()
  @Matches(FACTOR_PATTERN)
  density?: string;
  @ValidateIf(
    (dto: CreateItemConversionDto) =>
      dto.mode !== UnitConversionMode.SAME_DIMENSION,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  notes?: string;
  @IsOptional() @IsDateString() validFrom?: string;
}

export class ListBalancesDto extends InventoryPageDto {
  @IsOptional() @IsUUID() locationId?: string;
  @IsOptional() @IsUUID() itemId?: string;
  @IsOptional() @IsIn(['ALL', 'LOW', 'OUT']) status: 'ALL' | 'LOW' | 'OUT' =
    'ALL';
  @IsOptional() @IsIn(['name', 'sku', 'quantity', 'updatedAt']) sortBy = 'name';
}

export class ListMovementsDto extends InventoryPageDto {
  @IsOptional() @IsUUID() locationId?: string;
  @IsOptional() @IsUUID() itemId?: string;
  @IsOptional() @IsEnum(StockMovementType) type?: StockMovementType;
  @IsOptional() @IsString() sourceType?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsIn(['occurredAt', 'quantity', 'createdAt']) sortBy =
    'occurredAt';
  sortOrder: 'asc' | 'desc' = 'desc';
}

export class OpeningBalanceLineDto {
  @IsUUID() locationId!: string;
  @IsUUID() itemId!: string;
  @IsString() @Matches(QUANTITY_PATTERN) quantity!: string;
  @IsOptional() @IsString() @Matches(COST_PATTERN) unitCost?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class PostOpeningBalancesDto {
  @IsUUID() batchId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => OpeningBalanceLineDto)
  lines!: OpeningBalanceLineDto[];
}

export class ListPurchaseReceiptsDto extends InventoryPageDto {
  @IsOptional() @IsUUID() locationId?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsIn(['receivedAt', 'createdAt', 'supplierName']) sortBy =
    'receivedAt';
  sortOrder: 'asc' | 'desc' = 'desc';
}

export class PurchaseReceiptLineDto {
  @IsUUID() itemId!: string;
  @IsUUID() unitId!: string;
  @IsString() @Matches(QUANTITY_PATTERN) quantity!: string;
  @IsString() @Matches(COST_PATTERN) unitPrice!: string;
}

export class CreatePurchaseReceiptDto {
  @IsUUID() clientRequestId!: string;
  @IsUUID() locationId!: string;
  @IsString() @MinLength(1) @MaxLength(150) supplierName!: string;
  @IsOptional() @IsString() @MaxLength(100) referenceNo?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsOptional() @IsDateString() receivedAt?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PurchaseReceiptLineDto)
  lines!: PurchaseReceiptLineDto[];
}

export class RecipeLineDto {
  @IsUUID() itemId!: string;
  @IsString() @Matches(QUANTITY_PATTERN) quantity!: string;
}

export class ConfigureProductInventoryDto {
  @IsEnum(ProductInventoryMode) mode!: ProductInventoryMode;
  @IsUUID() locationId!: string;
  @IsOptional() @IsUUID() directItemId?: string;
  @IsOptional() @IsString() @Matches(QUANTITY_PATTERN) directQuantity?: string;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RecipeLineDto)
  lines?: RecipeLineDto[];
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class ListStockAdjustmentsDto extends InventoryPageDto {
  @IsOptional() @IsEnum(StockAdjustmentKind) kind?: StockAdjustmentKind;
  @IsOptional() @IsEnum(StockAdjustmentReason) reason?: StockAdjustmentReason;
  @IsOptional() @IsUUID() locationId?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsIn(['occurredAt', 'createdAt']) sortBy = 'occurredAt';
  sortOrder: 'asc' | 'desc' = 'desc';
}

export class StockAdjustmentLineDto {
  @IsUUID() itemId!: string;
  @IsUUID() unitId!: string;
  @IsString() @Matches(QUANTITY_PATTERN) quantity!: string;
  /** Required for adjustments; waste always takes stock out. */
  @IsOptional()
  @IsEnum(StockMovementDirection)
  direction?: StockMovementDirection;
}

export class CreateStockAdjustmentDto {
  @IsUUID() clientRequestId!: string;
  @IsUUID() locationId!: string;
  @IsEnum(StockAdjustmentReason) reason!: StockAdjustmentReason;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsOptional() @IsDateString() occurredAt?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => StockAdjustmentLineDto)
  lines!: StockAdjustmentLineDto[];
}

export class ListStocktakesDto extends InventoryPageDto {
  @IsOptional() @IsEnum(StocktakeStatus) status?: StocktakeStatus;
  @IsOptional() @IsUUID() locationId?: string;
  @IsOptional() @IsIn(['createdAt', 'postedAt']) sortBy = 'createdAt';
  sortOrder: 'asc' | 'desc' = 'desc';
}

export class CreateStocktakeDto {
  @IsUUID() clientRequestId!: string;
  @IsUUID() locationId!: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class StocktakeCountDto {
  @IsUUID() itemId!: string;
  @IsUUID() unitId!: string;
  @IsString() @Matches(QUANTITY_PATTERN) quantity!: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class RecordStocktakeCountsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => StocktakeCountDto)
  lines!: StocktakeCountDto[];
}

export class CancelStocktakeDto {
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class OptionConsumptionLineDto {
  @IsUUID() itemId!: string;
  @IsString() @Matches(QUANTITY_PATTERN) quantity!: string;
}

/** Replaces the ingredients of one option value; an empty list removes its consumption. */
export class ConfigureOptionConsumptionDto {
  @ValidateIf((dto: ConfigureOptionConsumptionDto) => dto.lines?.length > 0)
  @IsUUID()
  locationId?: string;
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OptionConsumptionLineDto)
  lines!: OptionConsumptionLineDto[];
}

export class PrepLineDto {
  @IsUUID() itemId!: string;
  /** In the item's base unit. */
  @IsString() @Matches(QUANTITY_PATTERN) quantity!: string;
}

export class ConfigurePrepRecipeDto {
  /** Standard output of one run of the recipe, in the output item's base unit. */
  @IsString() @Matches(QUANTITY_PATTERN) outputQuantity!: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PrepLineDto)
  lines!: PrepLineDto[];
}

export class ListPrepBatchesDto extends InventoryPageDto {
  @IsOptional() @IsEnum(PrepBatchStatus) status?: PrepBatchStatus;
  @IsOptional() @IsUUID() locationId?: string;
  @IsOptional() @IsUUID() outputItemId?: string;
  @IsOptional() @IsIn(['startedAt', 'completedAt']) sortBy = 'startedAt';
  sortOrder: 'asc' | 'desc' = 'desc';
}

export class StartPrepBatchDto {
  @IsUUID() clientRequestId!: string;
  @IsUUID() locationId!: string;
  @IsUUID() outputItemId!: string;
  @IsString() @Matches(QUANTITY_PATTERN) plannedQuantity!: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PrepLineDto)
  lines!: PrepLineDto[];
}

export class CompletePrepBatchDto {
  @IsString() @Matches(QUANTITY_PATTERN) actualQuantity!: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class VoidPrepBatchDto {
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
  /** RESTOCK returns the issued inputs; WASTE records them as spoiled. */
  @IsIn(['RESTOCK', 'WASTE']) disposition!: 'RESTOCK' | 'WASTE';
}

export class TransferLineDto {
  @IsUUID() itemId!: string;
  /** In the item's base unit. */
  @IsString() @Matches(QUANTITY_PATTERN) quantity!: string;
}

class TransferLinesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  lines!: TransferLineDto[];
}

export class ListStockRequestsDto extends InventoryPageDto {
  @IsOptional() @IsEnum(StockRequestStatus) status?: StockRequestStatus;
  @IsOptional() @IsUUID() locationId?: string;
  @IsOptional() @IsIn(['requestedAt', 'reviewedAt']) sortBy = 'requestedAt';
  sortOrder: 'asc' | 'desc' = 'desc';
}

export class CreateStockRequestDto extends TransferLinesDto {
  @IsUUID() clientRequestId!: string;
  /** Where the stock comes from, usually a warehouse. */
  @IsUUID() sourceLocationId!: string;
  @IsUUID() destinationLocationId!: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class ApproveStockRequestDto {
  /** Approved quantity per item; omitted items are approved as requested, 0 drops an item. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  lines?: TransferLineDto[];
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class ReasonDto {
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class ListStockTransfersDto extends InventoryPageDto {
  @IsOptional() @IsEnum(StockTransferStatus) status?: StockTransferStatus;
  @IsOptional() @IsUUID() locationId?: string;
  @IsOptional() @IsIn(['createdAt', 'shippedAt']) sortBy = 'createdAt';
  sortOrder: 'asc' | 'desc' = 'desc';
}

export class CreateStockTransferDto extends TransferLinesDto {
  @IsUUID() clientRequestId!: string;
  @IsUUID() sourceLocationId!: string;
  @IsUUID() destinationLocationId!: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class ShipStockTransferDto {
  /** Shipped quantity per item; omitted items ship in full, 0 leaves an item behind. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  lines?: TransferLineDto[];
}

export class ReceiveStockTransferDto extends TransferLinesDto {
  @IsUUID() clientRequestId!: string;
}

export class FoodCostReportDto {
  @IsDateString() dateFrom!: string;
  @IsDateString() dateTo!: string;
  @IsOptional() @IsUUID() outletId?: string;
}
