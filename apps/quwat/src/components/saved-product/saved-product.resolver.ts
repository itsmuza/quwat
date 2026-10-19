import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { SavedProductService } from './saved-product.service';
import { Product, Products } from '../../libs/dto/product/product';
import { OrdinaryInquiry } from '../../libs/dto/product/product.input';
import { Member } from '../../libs/dto/member/member';
import { MemberType } from '../../libs/enums/member.enum';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@Resolver(() => Product)
export class SavedProductResolver {
	constructor(private readonly savedProductService: SavedProductService) {}
	@Roles(MemberType.CLIENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Boolean)
	saveProduct(@Args('productId') productId: string, @AuthMember() member: Member): Promise<boolean> {
		return this.savedProductService.saveProduct(member, productId);
	}
	@Roles(MemberType.CLIENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Boolean)
	unsaveProduct(@Args('productId') productId: string, @AuthMember() member: Member): Promise<boolean> {
		return this.savedProductService.unsaveProduct(member, productId);
	}
	@Roles(MemberType.CLIENT)
	@UseGuards(RolesGuard)
	@Query(() => Products)
	getSavedProducts(@Args('input') input: OrdinaryInquiry, @AuthMember() member: Member): Promise<Products> {
		return this.savedProductService.getSavedProducts(member, input);
	}
	@ResolveField(() => Boolean)
	meSaved(@Parent() product: Product, @AuthMember() member: Member | null): Promise<boolean> {
		return this.savedProductService.isSaved(member, product._id);
	}
}
