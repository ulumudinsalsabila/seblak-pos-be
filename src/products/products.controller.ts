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
import { CreateProductDto, UpdateProductDto } from './product.dto';
import { ProductsService } from './products.service';

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}
  @Get() async list(
    @Query('activeOnly') active?: string,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return {
      data: await this.products.list(active === 'true', search, categoryId),
      meta: null,
    };
  }
  @Get(':id') async find(@Param('id') id: string) {
    return { data: await this.products.find(id), meta: null };
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
