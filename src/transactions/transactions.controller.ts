import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import {
  CreateTransactionDto,
  ListTransactionsDto,
  VoidTransactionDto,
} from './transaction.dto';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}
  @Post() async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTransactionDto,
  ) {
    return { data: await this.transactions.create(user.id, dto), meta: null };
  }
  @Get() async list(@Query() query: ListTransactionsDto) {
    return this.transactions.list(query);
  }
  @Get(':id') async find(@Param('id') id: string) {
    return { data: await this.transactions.find(id), meta: null };
  }
  @Post(':id/void') @Roles(Role.OWNER) async void(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: VoidTransactionDto,
  ) {
    return {
      data: await this.transactions.void(id, user.id, dto.voidReason),
      meta: null,
    };
  }
}
