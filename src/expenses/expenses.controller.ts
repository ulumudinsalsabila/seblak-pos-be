import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { CreateExpenseDto, UpdateExpenseDto } from './expense.dto';
import { ExpensesService } from './expenses.service';

@Controller('expenses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER)
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}
  @Get() async list() {
    return { data: await this.expenses.list(), meta: null };
  }
  @Post() async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateExpenseDto,
  ) {
    return { data: await this.expenses.create(user.id, dto), meta: null };
  }
  @Get(':id') async find(@Param('id') id: string) {
    return { data: await this.expenses.find(id), meta: null };
  }
  @Patch(':id') async update(
    @Param('id') id: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return { data: await this.expenses.update(id, dto), meta: null };
  }
  @Delete(':id') async remove(@Param('id') id: string) {
    return { data: await this.expenses.remove(id), meta: null };
  }
}
