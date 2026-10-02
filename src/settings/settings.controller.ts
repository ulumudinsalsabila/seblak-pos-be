import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { UpdateSettingsDto } from './settings.dto';
import { SettingsService } from './settings.service';
import { ProductImagesService } from '../products/product-images.service';
import { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/current-user.decorator';
import { requireOutlet } from '../common/outlet-context';

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly productImages: ProductImagesService,
  ) {}
  @Get('branding') async branding(@Query('outlet') outletCode?: string) {
    return { data: await this.settings.getBranding(outletCode), meta: null };
  }
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  async get(@CurrentUser() user: AuthUser) {
    return { data: await this.settings.get(requireOutlet(user)), meta: null };
  }
  @Post('image-signature')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  uploadImageSignature() {
    return {
      data: this.productImages.createUploadSignature('seblak/branding'),
      meta: null,
    };
  }
  @Patch()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  async update(@CurrentUser() user: AuthUser, @Body() dto: UpdateSettingsDto) {
    return {
      data: await this.settings.update(requireOutlet(user), dto),
      meta: null,
    };
  }
}
