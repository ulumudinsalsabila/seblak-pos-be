import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateProductDto,
  ListProductsDto,
  UpdateProductDto,
} from './product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(outletId: string, query: ListProductsDto) {
    const search = query.search?.trim();
    const where: Prisma.ProductWhereInput = {
      outletId,
      ...(query.activeOnly === 'true'
        ? { isActive: true, category: { isActive: true } }
        : {}),
      ...(query.status ? { isActive: query.status === 'ACTIVE' } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const paginated = query.page !== undefined || query.limit !== undefined;
    const findMany = this.prisma.product.findMany({
      where,
      include: { category: true },
      orderBy: [
        { category: { sortOrder: 'asc' as const } },
        { name: 'asc' as const },
      ],
      ...(paginated ? { skip: (page - 1) * limit, take: limit } : {}),
    });

    if (!paginated) {
      return { data: await findMany, meta: null };
    }

    const [data, total] = await Promise.all([
      findMany,
      this.prisma.product.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async find(outletId: string, id: string) {
    const item = await this.prisma.product.findFirst({
      where: { id, outletId },
      include: { category: true },
    });
    if (!item) throw new NotFoundException('Product not found');
    return item;
  }

  async create(outletId: string, dto: CreateProductDto) {
    await this.requireCategory(outletId, dto.categoryId);
    try {
      return await this.prisma.product.create({
        data: {
          outletId,
          categoryId: dto.categoryId,
          name: dto.name.trim(),
          sku: dto.sku.trim().toUpperCase(),
          pricingType: dto.pricingType,
          price: dto.price,
          trackStock: dto.trackStock,
          stock: dto.trackStock ? dto.stock : null,
          imageUrl: dto.imageUrl?.trim(),
          isActive: dto.isActive,
        },
        include: { category: true },
      });
    } catch (error) {
      this.handleUnique(error);
      throw error;
    }
  }

  async update(outletId: string, id: string, dto: UpdateProductDto) {
    const existing = await this.find(outletId, id);
    if (dto.categoryId) await this.requireCategory(outletId, dto.categoryId);
    const trackStock = dto.trackStock ?? existing.trackStock;
    if (trackStock && (dto.stock ?? existing.stock) === null)
      throw new UnprocessableEntityException(
        'Stock is required when stock tracking is enabled',
      );
    try {
      return await this.prisma.product.update({
        where: { id },
        data: {
          categoryId: dto.categoryId,
          name: dto.name?.trim(),
          sku: dto.sku?.trim().toUpperCase(),
          pricingType: dto.pricingType,
          price: dto.price,
          trackStock: dto.trackStock,
          stock: trackStock ? dto.stock : null,
          imageUrl: dto.imageUrl?.trim(),
          isActive: dto.isActive,
        },
        include: { category: true },
      });
    } catch (error) {
      this.handleUnique(error);
      throw error;
    }
  }

  async remove(outletId: string, id: string) {
    await this.find(outletId, id);
    await this.prisma.product.delete({ where: { id } });
    return { success: true };
  }

  private async requireCategory(outletId: string, id: string) {
    if (!(await this.prisma.category.findFirst({ where: { id, outletId } })))
      throw new NotFoundException('Category not found');
  }
  private handleUnique(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    )
      throw new ConflictException('SKU already exists');
  }
}
