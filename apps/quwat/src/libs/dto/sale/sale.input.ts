import { Field, Float, InputType } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	IsEnum,
	IsInt,
	IsMongoId,
	IsNumber,
	IsOptional,
	IsUUID,
	Max,
	Min,
	ValidateNested,
} from 'class-validator';
import { ProductUnit } from '../../enums/product.enum';
import { WholeSom } from '../../scalars/whole-som.scalar';
import { SalePaymentMethod, SaleStatus } from '../../enums/sale.enum';
import { OrdinaryInquiry } from '../product/product.input';
import { IsAttendanceDate } from '../../validation/attendance-date';
@InputType()
export class SaleItemInput {
	@IsEnum(ProductUnit) @Field(() => ProductUnit) expectedProductUnit!: ProductUnit;
	@IsMongoId() @Field(() => String) productId!: string;
	@IsNumber({ maxDecimalPlaces: 3, allowNaN: false, allowInfinity: false })
	@Min(0.001)
	@Max(1000000000)
	@Field(() => Float)
	quantity!: number;
	@IsInt() @Min(0) @Max(Number.MAX_SAFE_INTEGER) @Field(() => WholeSom) expectedUnitPrice!: number;
}
@InputType()
export class RequestSaleInput {
	@IsUUID('4') @Field(() => String) requestKey!: string;
	@IsEnum(SalePaymentMethod) @Field(() => SalePaymentMethod) paymentMethod!: SalePaymentMethod;
	@IsInt() @Min(0) @Max(Number.MAX_SAFE_INTEGER) @Field(() => WholeSom) expectedTotal!: number;
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(100)
	@ValidateNested({ each: true })
	@Type(() => SaleItemInput)
	@Field(() => [SaleItemInput])
	items!: SaleItemInput[];
}
@InputType()
export class SaleIdInput {
	@IsMongoId() @Field(() => String) _id!: string;
}
@InputType()
export class SalesInquiry extends OrdinaryInquiry {
	@IsOptional() @IsEnum(SaleStatus) @Field(() => SaleStatus, { nullable: true }) saleStatus?: SaleStatus;
}
@InputType()
export class AdminSalesInquiry extends SalesInquiry {
	@IsOptional() @IsAttendanceDate() @Field(() => String, { nullable: true }) date?: string;
}
@InputType()
export class DailySalesInput {
	@IsOptional() @IsAttendanceDate() @Field(() => String, { nullable: true }) date?: string;
}
