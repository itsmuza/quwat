import { Field, Float, InputType, Int, PartialType } from '@nestjs/graphql';
import { Transform, Type } from 'class-transformer';
import {
	ArrayMaxSize,
	IsArray,
	IsBoolean,
	IsDate,
	IsDefined,
	IsEnum,
	IsIn,
	IsInt,
	IsMongoId,
	IsNumber,
	IsOptional,
	IsString,
	Length,
	Max,
	Min,
	ValidateNested,
} from 'class-validator';
import { ProductStatus, ProductType, ProductUnit } from '../../enums/product.enum';
import { Direction } from '../../enums/common.enum';
import { availableProductSorts } from '../../config';
import { WholeSom } from '../../scalars/whole-som.scalar';
import { MAX_QUANTITY } from '../../validation/product-quantity';

@InputType()
export class ProductInput {
	@Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
	@IsString()
	@Length(3, 100)
	@Field(() => String)
	productName!: string;
	@IsEnum(ProductType) @Field(() => ProductType) productType!: ProductType;
	@IsOptional()
	@IsEnum(ProductStatus)
	@Field(() => ProductStatus, { nullable: true })
	productStatus?: ProductStatus;
	@IsEnum(ProductUnit) @Field(() => ProductUnit) productUnit!: ProductUnit;
	@IsInt()
	@Min(0)
	@Max(Number.MAX_SAFE_INTEGER)
	@Field(() => WholeSom)
	productPrice!: number;
	@IsOptional()
	@IsString()
	@Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
	@Field(() => String, { nullable: true })
	productBrand?: string;
	@IsOptional()
	@IsString()
	@Field(() => String, { nullable: true })
	productDesc?: string;
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	@Field(() => [String], { nullable: true })
	productImages?: string[];
	@IsOptional()
	@IsNumber({ maxDecimalPlaces: 3, allowNaN: false, allowInfinity: false })
	@Min(0)
	@Max(MAX_QUANTITY)
	@Field(() => Float, { nullable: true })
	productQuantity?: number;
	@IsOptional()
	@IsNumber({ maxDecimalPlaces: 3, allowNaN: false, allowInfinity: false })
	@Min(0.001)
	@Max(MAX_QUANTITY)
	@Field(() => Float, { nullable: true })
	productMinOrderQuantity?: number;
	@IsOptional()
	@IsNumber({ maxDecimalPlaces: 3, allowNaN: false, allowInfinity: false })
	@Min(0.001)
	@Max(MAX_QUANTITY)
	@Field(() => Float, { nullable: true })
	productQuantityStep?: number;
}
@InputType()
export class ProductUpdate extends PartialType(ProductInput) {
	@IsMongoId() @Field(() => String) _id!: string;
	@IsOptional()
	@IsNumber({ maxDecimalPlaces: 3, allowNaN: false, allowInfinity: false })
	@Min(0)
	@Max(MAX_QUANTITY)
	@Field(() => Float, { nullable: true })
	expectedProductQuantity?: number;
}
@InputType()
export class OrdinaryInquiry {
	@IsInt() @Min(1) @Field(() => Int) page!: number;
	@IsInt() @Min(1) @Max(100) @Field(() => Int) limit!: number;
}
@InputType()
export class PricesRange {
	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(Number.MAX_SAFE_INTEGER)
	@Field(() => WholeSom, { nullable: true })
	start?: number;
	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(Number.MAX_SAFE_INTEGER)
	@Field(() => WholeSom, { nullable: true })
	end?: number;
}
@InputType()
export class PeriodsRange {
	@IsOptional() @IsDate() @Field(() => Date, { nullable: true }) start?: Date;
	@IsOptional() @IsDate() @Field(() => Date, { nullable: true }) end?: Date;
}
@InputType()
export class ProductSearch {
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(7)
	@IsEnum(ProductType, { each: true })
	@Field(() => [ProductType], { nullable: true })
	typeList?: ProductType[];
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(4)
	@IsEnum(ProductUnit, { each: true })
	@Field(() => [ProductUnit], { nullable: true })
	unitList?: ProductUnit[];
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(100)
	@IsString({ each: true })
	@Field(() => [String], { nullable: true })
	brandList?: string[];
	@IsOptional()
	@ValidateNested()
	@Type(() => PricesRange)
	@Field(() => PricesRange, { nullable: true })
	pricesRange?: PricesRange;
	@IsOptional()
	@ValidateNested()
	@Type(() => PeriodsRange)
	@Field(() => PeriodsRange, { nullable: true })
	periodsRange?: PeriodsRange;
	@IsOptional()
	@IsBoolean()
	@Field(() => Boolean, { nullable: true })
	inStock?: boolean;
	@IsOptional()
	@IsString()
	@Length(1, 100)
	@Field(() => String, { nullable: true })
	text?: string;
}
@InputType()
export class AdminProductSearch extends ProductSearch {
	@IsOptional()
	@IsEnum(ProductStatus)
	@Field(() => ProductStatus, { nullable: true })
	productStatus?: ProductStatus;
}
@InputType()
export class ProductsInquiry extends OrdinaryInquiry {
	@IsOptional()
	@IsIn(availableProductSorts)
	@Field(() => String, { nullable: true })
	sort?: string;
	@IsOptional()
	@IsEnum(Direction)
	@Field(() => Direction, { nullable: true })
	direction?: Direction;
	@IsDefined()
	@ValidateNested()
	@Type(() => ProductSearch)
	@Field(() => ProductSearch)
	search!: ProductSearch;
}
@InputType()
export class AllProductsInquiry extends OrdinaryInquiry {
	@IsOptional()
	@IsIn(availableProductSorts)
	@Field(() => String, { nullable: true })
	sort?: string;
	@IsOptional()
	@IsEnum(Direction)
	@Field(() => Direction, { nullable: true })
	direction?: Direction;
	@IsDefined()
	@ValidateNested()
	@Type(() => AdminProductSearch)
	@Field(() => AdminProductSearch)
	search!: AdminProductSearch;
}
