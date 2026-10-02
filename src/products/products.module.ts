import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductImagesService } from './product-images.service';
import { ProductsService } from './products.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, ProductImagesService],
  exports: [ProductImagesService],
})
export class ProductsModule {}
