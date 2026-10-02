import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import {
  CreateOutletDto,
  ListFeeLedgerDto,
  UpdateFeeDto,
  UpdateOutletDto,
  UpdateOutletStatusDto,
} from './admin.dto';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('outlets')
  async outlets() {
    return { data: await this.admin.listOutlets(), meta: null };
  }

  @Get('tenants')
  async tenants() {
    return { data: await this.admin.listTenants(), meta: null };
  }

  @Post('outlets')
  async createOutlet(@Body() dto: CreateOutletDto) {
    return { data: await this.admin.createOutlet(dto), meta: null };
  }

  @Patch('outlets/:id/fee')
  async setFee(@Param('id') id: string, @Body() dto: UpdateFeeDto) {
    return { data: await this.admin.setFee(id, dto), meta: null };
  }

  @Patch('outlets/:id')
  async updateOutlet(@Param('id') id: string, @Body() dto: UpdateOutletDto) {
    return { data: await this.admin.updateOutlet(id, dto), meta: null };
  }

  @Delete('outlets/:id')
  async removeOutlet(@Param('id') id: string) {
    return { data: await this.admin.removeOutlet(id), meta: null };
  }

  @Patch('outlets/:id/status')
  async setStatus(@Param('id') id: string, @Body() dto: UpdateOutletStatusDto) {
    return { data: await this.admin.setStatus(id, dto.status), meta: null };
  }

  @Get('fee-ledger')
  ledger(@Query() query: ListFeeLedgerDto) {
    return this.admin.feeLedger(query);
  }
}
