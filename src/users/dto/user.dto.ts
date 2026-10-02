import { Role, UserStatus } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(8) @MaxLength(72) password!: string;
  @IsIn([Role.OWNER, Role.MANAGER, Role.CASHIER, Role.KITCHEN]) role!: Role;
}

export class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) name?: string;
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @IsString() @MinLength(8) @MaxLength(72) password?: string;
  @IsOptional()
  @IsIn([Role.OWNER, Role.MANAGER, Role.CASHIER, Role.KITCHEN])
  role?: Role;
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
}
