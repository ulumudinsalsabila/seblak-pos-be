import {
  Body,
  Controller,
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
  @Get() async list(@Query() query: ListProductsDto) {
    return this.products.list(query);
  }
  @Get(':id') async find(@Param('id') id: string) {
    return { data: await this.products.find(id), meta: null };
  }
  @Post('image-signature')
  @Roles(Role.OWNER)
  uploadImageSignature() {
    return { data: this.productImages.createUploadSignature(), meta: null };
  }
  @Post() @Roles(Role.OWNER) async create(@Body() dto: CreateProductDto) {
    return { data: await this.products.create(dto), meta: null };
  }
  @Patch(':id') @Roles(Role.OWNER) async update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return { data: await this.products.update(id, dto), meta: null };
  }
}
