import { IsUUID } from 'class-validator';

export class SwitchOutletDto {
  @IsUUID() outletId!: string;
}
