import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCategoryDto,
  ListCategoriesDto,
  UpdateCategoryDto,
} from './category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}
  async list(outletId: string, query: ListCategoriesDto) {
    const search = query.search?.trim();
    const where: Prisma.CategoryWhereInput = {
      outletId,
      ...(query.activeOnly === 'true' ? { isActive: true } : {}),
      ...(query.status ? { isActive: query.status === 'ACTIVE' } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const paginated = query.page !== undefined || query.limit !== undefined;
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const orderBy = {
      [query.sortBy]: query.sortOrder,
    } as Prisma.CategoryOrderByWithRelationInput;
    const findMany = this.prisma.category.findMany({
      where,
      orderBy: [orderBy, { name: 'asc' }],
      ...(paginated ? { skip: (page - 1) * limit, take: limit } : {}),
    });
    if (!paginated) return { data: await findMany, meta: null };
    const [data, total] = await Promise.all([
      findMany,
      this.prisma.category.count({ where }),
    ]);
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
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
