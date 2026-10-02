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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './category.dto';

@Controller('categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}
  @Get() @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER) async list(
    @CurrentUser() user: AuthUser,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return {
      data: await this.categories.list(
        requireOutlet(user),
        activeOnly === 'true',
      ),
      meta: null,
    };
  }
  @Get(':id') @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER) async find(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return {
      data: await this.categories.find(requireOutlet(user), id),
      meta: null,
    };
  }
  @Post() @Roles(Role.OWNER, Role.MANAGER) async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCategoryDto,
  ) {
    return {
      data: await this.categories.create(requireOutlet(user), dto),
      meta: null,
    };
  }
  @Patch(':id') @Roles(Role.OWNER, Role.MANAGER) async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return {
      data: await this.categories.update(requireOutlet(user), id, dto),
      meta: null,
    };
  }
  @Delete(':id') @Roles(Role.OWNER, Role.MANAGER) async remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return {
      data: await this.categories.remove(requireOutlet(user), id),
      meta: null,
    };
  }
}
