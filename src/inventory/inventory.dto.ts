import {
  InventoryItemType,
  StockLocationType,
  StockMovementType,
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
