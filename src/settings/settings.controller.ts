import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { UpdateSettingsDto } from './settings.dto';
import { SettingsService } from './settings.service';
import { ProductImagesService } from '../products/product-images.service';

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly productImages: ProductImagesService,
  ) {}
  @Get('branding') async branding() {
    return { data: await this.settings.getBranding(), meta: null };
  }
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  async get() {
    return { data: await this.settings.get(), meta: null };
  }
  @Post('image-signature')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER)
  uploadImageSignature() {
    return {
      data: this.productImages.createUploadSignature('seblak/branding'),
      meta: null,
    };
  }
  @Patch()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER)
  async update(@Body() dto: UpdateSettingsDto) {
    return { data: await this.settings.update(dto), meta: null };
  }
}
