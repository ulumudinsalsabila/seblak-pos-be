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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './category.dto';

@Controller('categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}
  @Get() async list(@Query('activeOnly') activeOnly?: string) {
    return {
      data: await this.categories.list(activeOnly === 'true'),
      meta: null,
    };
  }
  @Get(':id') async find(@Param('id') id: string) {
    return { data: await this.categories.find(id), meta: null };
  }
  @Post() @Roles(Role.OWNER) async create(@Body() dto: CreateCategoryDto) {
    return { data: await this.categories.create(dto), meta: null };
  }
  @Patch(':id') @Roles(Role.OWNER) async update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return { data: await this.categories.update(id, dto), meta: null };
  }
}
