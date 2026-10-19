import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import SaleSchema from '../../libs/schemas/Sale.model';
import ProductSchema from '../../libs/schemas/Product.model';
import SaleNotificationReadSchema from '../../libs/schemas/SaleNotificationRead.model';
import { SocketModule } from '../../socket/socket.module';
import { SaleInboxService } from './sale-inbox.service';
import { AuthModule } from '../auth/auth.module';
import { SaleService } from './sale.service';
import { SaleResolver } from './sale.resolver';
@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Sale', schema: SaleSchema },
			{ name: 'Product', schema: ProductSchema },
			{ name: 'SaleNotificationRead', schema: SaleNotificationReadSchema },
		]),
		AuthModule,
		SocketModule,
	],
	providers: [SaleService, SaleInboxService, SaleResolver],
	exports: [SaleService],
})
export class SaleModule {}
