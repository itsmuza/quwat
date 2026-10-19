import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import GuestLikeSchema from '../../libs/schemas/GuestLike.model';
import ProductSchema from '../../libs/schemas/Product.model';
import MemberSchema from '../../libs/schemas/Member.model';
import { GuestLikeService } from './guest-like.service';
import { GuestLikeResolver, MemberGuestLikeResolver, ProductGuestLikeResolver } from './guest-like.resolver';
@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'GuestLike', schema: GuestLikeSchema },
			{ name: 'Product', schema: ProductSchema },
			{ name: 'Member', schema: MemberSchema },
		]),
	],
	providers: [GuestLikeService, GuestLikeResolver, ProductGuestLikeResolver, MemberGuestLikeResolver],
})
export class GuestLikeModule {}
