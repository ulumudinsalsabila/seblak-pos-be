import { ReceiptPaperSize } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  IsUrl,
  Matches,
  IsArray,
  ArrayMaxSize,
  ValidateNested,
  IsInt,
  IsUUID,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

class MenuOptionValueDto {
  @IsString() @MinLength(1) @MaxLength(50) id!: string;
  @IsString() @MinLength(1) @MaxLength(100) label!: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

class MenuOptionGroupDto {
  @IsString() @MinLength(1) @MaxLength(50) id!: string;
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsOptional() @IsInt() @Min(0) @Max(9999) sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsUUID('4', { each: true })
  categoryIds!: string[];
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => MenuOptionValueDto)
  values!: MenuOptionValueDto[];
}

export class UpdateSettingsDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) storeName?: string;
  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  logoUrl?: string;
  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  faviconUrl?: string;
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  primaryColor?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @IsBoolean() taxEnabled?: boolean;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  taxPercentage?: number;
  @IsOptional() @IsString() @MaxLength(500) receiptHeader?: string;
  @IsOptional() @IsString() @MaxLength(500) receiptFooter?: string;
  @IsOptional() @IsEnum(ReceiptPaperSize) receiptPaperSize?: ReceiptPaperSize;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => MenuOptionGroupDto)
  menuOptions?: MenuOptionGroupDto[];
}
