import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { AdminDeletionService } from './admin-deletion.service';
import { AdminDeletionResolver } from './admin-deletion.resolver';
import ProductSchema from '../../libs/schemas/Product.model';
import MemberSchema from '../../libs/schemas/Member.model';
import LikeSchema from '../../libs/schemas/Like.model';
import ViewSchema from '../../libs/schemas/View.model';
import CommentSchema from '../../libs/schemas/Comment.model';
import GuestLikeSchema from '../../libs/schemas/GuestLike.model';
import SavedProductSchema from '../../libs/schemas/SavedProduct.model';
import SaleSchema from '../../libs/schemas/Sale.model';
import SaleNotificationReadSchema from '../../libs/schemas/SaleNotificationRead.model';
@Module({
	imports: [
		AuthModule,
		MongooseModule.forFeature([
			{ name: 'Product', schema: ProductSchema },
			{ name: 'Member', schema: MemberSchema },
			{ name: 'Like', schema: LikeSchema },
			{ name: 'View', schema: ViewSchema },
			{ name: 'Comment', schema: CommentSchema },
			{ name: 'GuestLike', schema: GuestLikeSchema },
			{ name: 'SavedProduct', schema: SavedProductSchema },
			{ name: 'Sale', schema: SaleSchema },
			{ name: 'SaleNotificationRead', schema: SaleNotificationReadSchema },
		]),
	],
	providers: [AdminDeletionService, AdminDeletionResolver],
})
export class AdminDeletionModule {}
