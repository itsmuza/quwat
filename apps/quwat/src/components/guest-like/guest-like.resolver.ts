import { Args, Context, Mutation, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { GuestLikeService } from './guest-like.service';
import type { GuestLikeContext } from './guest-like.service';
import { GuestLikeInput, GuestLikeResult } from '../../libs/dto/guest-like/guest-like';
import { Product } from '../../libs/dto/product/product';
import { Member } from '../../libs/dto/member/member';
import { ProductStatus } from '../../libs/enums/product.enum';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { LikeGroup } from '../../libs/enums/like.enum';
@Resolver()
export class GuestLikeResolver {
	constructor(private readonly service: GuestLikeService) {}
	@Mutation(() => GuestLikeResult)
	setGuestLike(@Args('input') input: GuestLikeInput, @Context() context: GuestLikeContext): Promise<GuestLikeResult> {
		return this.service.setLike(context, input);
	}
}
@Resolver(() => Product)
export class ProductGuestLikeResolver {
	constructor(private readonly service: GuestLikeService) {}
	@ResolveField(() => Boolean)
	guestLiked(@Parent() product: Product, @Context() context: GuestLikeContext): Promise<boolean> | boolean {
		return (
			product.productStatus === ProductStatus.ACTIVE && this.service.hasLike(context, LikeGroup.PRODUCT, product._id)
		);
	}
}
@Resolver(() => Member)
export class MemberGuestLikeResolver {
	constructor(private readonly service: GuestLikeService) {}
	@ResolveField(() => Boolean)
	guestLiked(@Parent() member: Member, @Context() context: GuestLikeContext): Promise<boolean> | boolean {
		return (
			member.memberType === MemberType.AGENT &&
			member.memberStatus === MemberStatus.ACTIVE &&
			this.service.hasLike(context, LikeGroup.MEMBER, member._id)
		);
	}
}
