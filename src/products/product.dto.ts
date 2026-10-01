import { PricingType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsBooleanString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class ListProductsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
  @IsOptional() @IsBooleanString() activeOnly?: string;
}

export class CreateProductDto {
  @IsUUID() categoryId!: string;
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsString() @MinLength(1) @MaxLength(50) sku!: string;
  @IsEnum(PricingType) pricingType!: PricingType;
  @IsInt() @Min(0) @Max(2_000_000_000) price!: number;
  @IsBoolean() trackStock!: boolean;
  @ValidateIf((o: CreateProductDto) => o.trackStock)
  @IsInt()
  @Min(0)
  stock?: number;
  @IsOptional() @IsString() @MaxLength(500) imageUrl?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateProductDto {
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(50) sku?: string;
  @IsOptional() @IsEnum(PricingType) pricingType?: PricingType;
  @IsOptional() @IsInt() @Min(0) @Max(2_000_000_000) price?: number;
  @IsOptional() @IsBoolean() trackStock?: boolean;
  @IsOptional() @IsInt() @Min(0) stock?: number;
  @IsOptional() @IsString() @MaxLength(500) imageUrl?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
