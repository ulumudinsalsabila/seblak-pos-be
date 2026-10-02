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
import { requireOutlet } from '../common/outlet-context';
import { CreateExpenseDto, UpdateExpenseDto } from './expense.dto';
import { ExpensesService } from './expenses.service';

@Controller('expenses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.MANAGER)
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}
  @Get() async list(@CurrentUser() user: AuthUser) {
    return { data: await this.expenses.list(requireOutlet(user)), meta: null };
  }
  @Post() async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateExpenseDto,
  ) {
    return {
      data: await this.expenses.create(requireOutlet(user), user.id, dto),
      meta: null,
    };
  }
  @Get(':id') async find(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return {
      data: await this.expenses.find(requireOutlet(user), id),
      meta: null,
    };
  }
  @Patch(':id') async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return {
      data: await this.expenses.update(requireOutlet(user), id, dto),
      meta: null,
    };
  }
  @Delete(':id') async remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return {
      data: await this.expenses.remove(requireOutlet(user), id),
      meta: null,
    };
  }
}
