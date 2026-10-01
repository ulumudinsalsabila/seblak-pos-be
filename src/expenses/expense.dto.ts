import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

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
