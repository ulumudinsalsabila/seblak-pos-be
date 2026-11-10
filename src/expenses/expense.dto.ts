import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  IsIn,
  IsUUID,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ListExpensesDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dateFrom?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dateTo?: string;
  @IsOptional() @IsUUID() createdById?: string;
  @IsOptional() @IsIn(['expenseDate', 'amount', 'createdAt']) sortBy =
    'expenseDate';
  @IsOptional() @IsIn(['asc', 'desc']) sortOrder: 'asc' | 'desc' = 'desc';
}

export class CreateExpenseDto {
  @IsString() @MinLength(1) @MaxLength(500) description!: string;
  @IsInt() @Min(1) @Max(2_000_000_000) amount!: number;
  @IsDateString({ strict: true }) expenseDate!: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class UpdateExpenseDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(500) description?: string;
  @IsOptional() @IsInt() @Min(1) @Max(2_000_000_000) amount?: number;
  @IsOptional() @IsDateString({ strict: true }) expenseDate?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
