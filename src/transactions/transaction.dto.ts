import { PaymentMethod, TransactionStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsDateString } from 'class-validator';

export class CheckoutItemDto {
  @IsUUID() productId!: string;
  @IsInt() @Min(1) @Max(10_000) quantity!: number;
}

export class CreateTransactionDto {
  @IsUUID() clientTransactionId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items!: CheckoutItemDto[];
  @IsInt() @Min(0) @Max(5) spicyLevel!: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsInt() @Min(0) @Max(2_000_000_000) discount!: number;
  @IsEnum(PaymentMethod) paymentMethod!: PaymentMethod;
  @IsOptional() @IsInt() @Min(0) @Max(2_000_000_000) amountReceived?: number;
}

export class VoidTransactionDto {
  @IsString() @MinLength(3) @MaxLength(500) voidReason!: string;
}

export class ListTransactionsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsDateString({ strict: true }) dateFrom?: string;
  @IsOptional() @IsDateString({ strict: true }) dateTo?: string;
  @IsOptional() @IsString() @MaxLength(32) invoiceNo?: string;
  @IsOptional() @IsUUID() cashierId?: string;
  @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod;
  @IsOptional() @IsEnum(TransactionStatus) status?: TransactionStatus;
}
