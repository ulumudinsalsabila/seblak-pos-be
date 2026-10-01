import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { UpdateSettingsDto } from './settings.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}
  @Get() async get() {
    return { data: await this.settings.get(), meta: null };
  }
  @Patch() @Roles(Role.OWNER) async update(@Body() dto: UpdateSettingsDto) {
    return { data: await this.settings.update(dto), meta: null };
  }
}
