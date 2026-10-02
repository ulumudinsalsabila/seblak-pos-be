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
} from 'class-validator';

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
}
