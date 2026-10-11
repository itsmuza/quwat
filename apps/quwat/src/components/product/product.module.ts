import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import ProductSchema from '../../libs/schemas/Product.model';
import { ProductService } from './product.service';
import { ProductResolver } from './product.resolver';
import { AuthModule } from '../auth/auth.module';
import { LikeModule } from '../like/like.module';
import { ViewModule } from '../view/view.module';
@Module({
	imports: [
		MongooseModule.forFeature([{ name: 'Product', schema: ProductSchema }]),
		AuthModule,
		LikeModule,
		ViewModule,
	],
	providers: [ProductService, ProductResolver],
	exports: [ProductService],
})
export class ProductModule {}
