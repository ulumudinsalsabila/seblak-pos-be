import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}
  list(outletId: string, activeOnly = false) {
    return this.prisma.category.findMany({
      where: { outletId, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }
  async find(outletId: string, id: string) {
    const item = await this.prisma.category.findFirst({
      where: { id, outletId },
    });
    if (!item) throw new NotFoundException('Category not found');
    return item;
  }
  create(outletId: string, dto: CreateCategoryDto) {
    return this.prisma.category.create({
      data: {
        ...dto,
        outletId,
        name: dto.name.trim(),
        description: dto.description?.trim(),
      },
    });
  }
  async update(outletId: string, id: string, dto: UpdateCategoryDto) {
    await this.find(outletId, id);
    return this.prisma.category.update({
      where: { id },
      data: {
        ...dto,
        name: dto.name?.trim(),
        description: dto.description?.trim(),
      },
    });
  }
  async remove(outletId: string, id: string) {
    await this.find(outletId, id);
    try {
      await this.prisma.category.delete({ where: { id } });
      return { success: true };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'Category cannot be deleted while it still has products',
        );
      }
      throw error;
    }
  }
}
