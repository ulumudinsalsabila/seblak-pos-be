import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto, UpdateProductDto } from './product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  list(activeOnly = false, search?: string, categoryId?: string) {
    return this.prisma.product.findMany({
      where: {
        ...(activeOnly ? { isActive: true, category: { isActive: true } } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { sku: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { category: true },
      orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
    });
  }

  async find(id: string) {
    const item = await this.prisma.product.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!item) throw new NotFoundException('Product not found');
    return item;
  }

  async create(dto: CreateProductDto) {
    await this.requireCategory(dto.categoryId);
    try {
      return await this.prisma.product.create({
        data: {
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

  async update(id: string, dto: UpdateProductDto) {
    const existing = await this.find(id);
    if (dto.categoryId) await this.requireCategory(dto.categoryId);
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

  private async requireCategory(id: string) {
    if (!(await this.prisma.category.findUnique({ where: { id } })))
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
