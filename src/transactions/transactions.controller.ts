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
  ListKitchenOrdersDto,
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
  @Get('kitchen') async kitchen(@Query() query: ListKitchenOrdersDto) {
    return { data: await this.transactions.kitchen(query), meta: null };
  }
  @Post('kitchen/:id/complete') async completeOrder(@Param('id') id: string) {
    return {
      data: await this.transactions.completeKitchenOrder(id),
      meta: null,
    };
  }
  @Post('kitchen/:id/items/:itemId/complete') async completeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return {
      data: await this.transactions.completeKitchenItem(id, itemId),
      meta: null,
    };
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
