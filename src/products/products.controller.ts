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
import { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/current-user.decorator';
import { requireOutlet } from '../common/outlet-context';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import {
  CreateProductDto,
  ListProductsDto,
  UpdateProductDto,
} from './product.dto';
import { ProductImagesService } from './product-images.service';
import { ProductsService } from './products.service';

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly productImages: ProductImagesService,
  ) {}
  @Get() @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER) async list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListProductsDto,
  ) {
    return this.products.list(requireOutlet(user), query);
  }
  @Get(':id') @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER) async find(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return {
      data: await this.products.find(requireOutlet(user), id),
      meta: null,
    };
  }
  @Post('image-signature')
  @Roles(Role.OWNER, Role.MANAGER)
  uploadImageSignature() {
    return { data: this.productImages.createUploadSignature(), meta: null };
  }
  @Post() @Roles(Role.OWNER, Role.MANAGER) async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateProductDto,
  ) {
    return {
      data: await this.products.create(requireOutlet(user), dto),
      meta: null,
    };
  }
  @Patch(':id') @Roles(Role.OWNER, Role.MANAGER) async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return {
      data: await this.products.update(requireOutlet(user), id, dto),
      meta: null,
    };
  }
  @Delete(':id') @Roles(Role.OWNER, Role.MANAGER) async remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return {
      data: await this.products.remove(requireOutlet(user), id),
      meta: null,
    };
  }
}
