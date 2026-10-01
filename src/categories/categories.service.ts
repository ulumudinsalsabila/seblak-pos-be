import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}
  list(activeOnly = false) {
    return this.prisma.category.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }
  async find(id: string) {
    const item = await this.prisma.category.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Category not found');
    return item;
  }
  create(dto: CreateCategoryDto) {
    return this.prisma.category.create({
      data: {
        ...dto,
        name: dto.name.trim(),
        description: dto.description?.trim(),
      },
    });
  }
  async update(id: string, dto: UpdateCategoryDto) {
    await this.find(id);
    return this.prisma.category.update({
      where: { id },
      data: {
        ...dto,
        name: dto.name?.trim(),
        description: dto.description?.trim(),
      },
    });
  }
}
