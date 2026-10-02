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
import { requireOutlet } from '../common/outlet-context';
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
  @Post() @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER) async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTransactionDto,
  ) {
    return {
      data: await this.transactions.create(requireOutlet(user), user.id, dto),
      meta: null,
    };
  }
  @Get() @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER) async list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListTransactionsDto,
  ) {
    return this.transactions.list(requireOutlet(user), query);
  }
  @Get('kitchen') @Roles(Role.OWNER, Role.MANAGER, Role.KITCHEN) async kitchen(
    @CurrentUser() user: AuthUser,
    @Query() query: ListKitchenOrdersDto,
  ) {
    return {
      data: await this.transactions.kitchen(requireOutlet(user), query),
      meta: null,
    };
  }
  @Post('kitchen/:id/complete')
  @Roles(Role.OWNER, Role.MANAGER, Role.KITCHEN)
  async completeOrder(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return {
      data: await this.transactions.completeKitchenOrder(
        requireOutlet(user),
        id,
      ),
      meta: null,
    };
  }
  @Post('kitchen/:id/items/:itemId/complete')
  @Roles(Role.OWNER, Role.MANAGER, Role.KITCHEN)
  async completeItem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return {
      data: await this.transactions.completeKitchenItem(
        requireOutlet(user),
        id,
        itemId,
      ),
      meta: null,
    };
  }
  @Get(':id') @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER) async find(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return {
      data: await this.transactions.find(requireOutlet(user), id),
      meta: null,
    };
  }
  @Post(':id/void') @Roles(Role.OWNER, Role.MANAGER) async void(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: VoidTransactionDto,
  ) {
    return {
      data: await this.transactions.void(
        requireOutlet(user),
        id,
        user.id,
        dto.voidReason,
      ),
      meta: null,
    };
  }
}
