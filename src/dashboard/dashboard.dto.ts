import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsUUID,
  Matches,
} from 'class-validator';

export enum DashboardScope {
  OUTLET = 'outlet',
  AUTHORIZED_OUTLETS = 'authorized-outlets',
}

export enum DashboardBucket {
  AUTO = 'auto',
  HOUR = 'hour',
  DAY = 'day',
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class OwnerDashboardDto {
  @IsOptional() @IsEnum(DashboardScope) scope = DashboardScope.OUTLET;
  @IsOptional() @IsUUID() outletId?: string;
  @IsOptional()
  @Matches(DATE, { message: 'dateFrom must use YYYY-MM-DD' })
  dateFrom?: string;
  @IsOptional()
  @Matches(DATE, { message: 'dateTo must use YYYY-MM-DD' })
  dateTo?: string;
  @IsOptional() @IsEnum(DashboardBucket) bucket = DashboardBucket.AUTO;
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? true : value === true || value === 'true',
  )
  @IsBoolean()
  comparison = true;
}
