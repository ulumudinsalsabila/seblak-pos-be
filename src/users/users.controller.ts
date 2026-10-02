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
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { UsersService } from './users.service';
import { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/current-user.decorator';
import { requireOutlet } from '../common/outlet-context';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER)
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get() async list(@CurrentUser() user: AuthUser) {
    return { data: await this.users.list(requireOutlet(user)), meta: null };
  }
  @Post() async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateUserDto,
  ) {
    return {
      data: await this.users.create(requireOutlet(user), dto),
      meta: null,
    };
  }
  @Get(':id') async find(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return { data: await this.users.find(requireOutlet(user), id), meta: null };
  }
  @Patch(':id') async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return {
      data: await this.users.update(requireOutlet(user), id, dto),
      meta: null,
    };
  }
  @Delete(':id') async remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return {
      data: await this.users.remove(requireOutlet(user), id, user.id),
      meta: null,
    };
  }
}
