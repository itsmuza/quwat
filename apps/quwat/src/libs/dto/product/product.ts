import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { ObjectId } from 'bson';
import { ProductStatus, ProductType, ProductUnit } from '../../enums/product.enum';
import { WholeSom } from '../../scalars/whole-som.scalar';
import { MeLiked } from '../like/like';
import { TotalCounter } from '../member/member';
@ObjectType()
export class Product {
	@Field(() => String)
	_id!: ObjectId;
	@Field(() => String)
	productName!: string;
	@Field(() => ProductType)
	productType!: ProductType;
	@Field(() => ProductStatus)
	productStatus!: ProductStatus;
	@Field(() => ProductUnit)
	productUnit!: ProductUnit;
	@Field(() => WholeSom)
	productPrice!: number;
	@Field(() => String, { nullable: true })
	productBrand?: string;
	@Field(() => String, { nullable: true })
	productDesc?: string;
	@Field(() => [String])
	productImages!: string[];
	@Field(() => Float)
	productQuantity!: number;
	@Field(() => Float)
	productReservedQuantity!: number;
	@Field(() => Float)
	productMinOrderQuantity!: number;
	@Field(() => Float)
	productQuantityStep!: number;
	@Field(() => Int)
	productViews!: number;
	@Field(() => Int)
	productLikes!: number;
	@Field(() => Int)
	productComments!: number;
	@Field(() => Int)
	productRank!: number;
	@Field(() => Date, { nullable: true })
	archivedAt?: Date | null;
	@Field(() => Date)
	createdAt!: Date;
	@Field(() => Date)
	updatedAt!: Date;
	@Field(() => [MeLiked], { nullable: true })
	meLiked?: MeLiked[];
}
@ObjectType()
export class Products {
	@Field(() => [Product]) list!: Product[];
	@Field(() => [TotalCounter]) metaCounter!: TotalCounter[];
}
