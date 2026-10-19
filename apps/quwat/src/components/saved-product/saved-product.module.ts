import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import SavedProductSchema from '../../libs/schemas/SavedProduct.model';
import ProductSchema from '../../libs/schemas/Product.model';
import { AuthModule } from '../auth/auth.module';
import { SavedProductService } from './saved-product.service';
import { SavedProductResolver } from './saved-product.resolver';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'SavedProduct', schema: SavedProductSchema },
			{ name: 'Product', schema: ProductSchema },
		]),
		AuthModule,
	],
	providers: [SavedProductService, SavedProductResolver],
	exports: [SavedProductService],
})
export class SavedProductModule {}
