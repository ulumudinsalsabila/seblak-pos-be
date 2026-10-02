import { FeeType, OutletStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateOutletDto {
  @IsOptional() @IsUUID() tenantId?: string;
  @ValidateIf((dto: CreateOutletDto) => !dto.tenantId)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  tenantName?: string;
  @ValidateIf((dto: CreateOutletDto) => !dto.tenantId)
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(80)
  tenantSlug?: string;
  @IsString() @MinLength(2) @MaxLength(100) outletName!: string;
  @IsString() @Matches(/^[A-Za-z0-9-]+$/) @MaxLength(50) outletCode!: string;
  @IsString() @MinLength(1) @MaxLength(100) ownerName!: string;
  @IsEmail() @MaxLength(254) ownerEmail!: string;
  @IsString() @MinLength(8) @MaxLength(72) ownerPassword!: string;
  @IsOptional() @IsEnum(FeeType) feeType?: FeeType;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) fixedAmount?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  percentage?: number;
}

export class UpdateFeeDto {
  @IsEnum(FeeType) type!: FeeType;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) fixedAmount?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  percentage?: number;
}

export class UpdateOutletStatusDto {
  @IsEnum(OutletStatus) status!: OutletStatus;
}

export class UpdateOutletDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) name?: string;
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9-]+$/)
  @MaxLength(50)
  code?: string;
}

export class ListFeeLedgerDto {
  @IsOptional() @IsString() outletId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
