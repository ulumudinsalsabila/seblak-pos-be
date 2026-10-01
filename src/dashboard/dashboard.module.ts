import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { DashboardController } from './dashboard.controller';

@Module({ imports: [ReportsModule], controllers: [DashboardController] })
export class DashboardModule {}
