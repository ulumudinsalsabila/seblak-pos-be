import {
  Body,
  Controller,
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

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER)
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get() async list() {
    return { data: await this.users.list(), meta: null };
  }
  @Post() async create(@Body() dto: CreateUserDto) {
    return { data: await this.users.create(dto), meta: null };
  }
  @Get(':id') async find(@Param('id') id: string) {
    return { data: await this.users.find(id), meta: null };
  }
  @Patch(':id') async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return { data: await this.users.update(id, dto), meta: null };
  }
}
