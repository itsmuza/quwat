import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ObjectId } from 'bson';
import { ProductService } from './product.service';
import { Product, Products } from '../../libs/dto/product/product';
import {
	AllProductsInquiry,
	OrdinaryInquiry,
	ProductInput,
	ProductsInquiry,
	ProductUpdate,
} from '../../libs/dto/product/product.input';
import { Member } from '../../libs/dto/member/member';
import { MemberType } from '../../libs/enums/member.enum';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { WithoutGuard } from '../auth/guards/without.guard';
import { shapeIntoMongoObject } from '../../libs/config';
@Resolver()
export class ProductResolver {
	constructor(private readonly productService: ProductService) {}
	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Product)
	createProduct(@Args('input') input: ProductInput, @AuthMember() admin: Member): Promise<Product> {
		return this.productService.createProduct(admin, input);
	}
	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Product)
	updateProduct(@Args('input') input: ProductUpdate, @AuthMember() admin: Member): Promise<Product> {
		return this.productService.updateProduct(admin, input);
	}
	@UseGuards(WithoutGuard)
	@Query(() => Product)
	getProduct(@Args('productId') id: string, @AuthMember('_id') memberId: ObjectId | null): Promise<Product> {
		return this.productService.getProduct(memberId, shapeIntoMongoObject(id));
	}
	@UseGuards(WithoutGuard)
	@Query(() => Products)
	getProducts(@Args('input') input: ProductsInquiry, @AuthMember('_id') memberId: ObjectId | null): Promise<Products> {
		return this.productService.getProducts(memberId, input);
	}
	@UseGuards(AuthGuard)
	@Query(() => Products)
	getFavorites(@Args('input') input: OrdinaryInquiry, @AuthMember('_id') memberId: ObjectId): Promise<Products> {
		return this.productService.getFavorites(memberId, input);
	}
	@UseGuards(AuthGuard)
	@Query(() => Products)
	getVisited(@Args('input') input: OrdinaryInquiry, @AuthMember('_id') memberId: ObjectId): Promise<Products> {
		return this.productService.getVisited(memberId, input);
	}
	@UseGuards(AuthGuard)
	@Mutation(() => Product)
	likeTargetProduct(@Args('productId') id: string, @AuthMember('_id') memberId: ObjectId): Promise<Product> {
		return this.productService.likeTargetProduct(memberId, shapeIntoMongoObject(id));
	}
	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => Products)
	getAllProductsByAdmin(@Args('input') input: AllProductsInquiry, @AuthMember() admin: Member): Promise<Products> {
		return this.productService.getAllProductsByAdmin(admin, input);
	}
	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Product)
	removeProductByAdmin(@Args('productId') id: string, @AuthMember() admin: Member): Promise<Product> {
		return this.productService.removeProductByAdmin(admin, shapeIntoMongoObject(id));
	}
}
