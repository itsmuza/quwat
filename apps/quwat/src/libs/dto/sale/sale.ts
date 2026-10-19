import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { ObjectId } from 'bson';
import { WholeSom } from '../../scalars/whole-som.scalar';
import { ProductType, ProductUnit } from '../../enums/product.enum';
import { SalePaymentMethod, SaleStatus } from '../../enums/sale.enum';
import { TotalCounter } from '../member/member';
@ObjectType()
export class SaleLine {
	@Field(() => String) productId!: ObjectId;
	@Field(() => String) productName!: string;
	@Field(() => ProductType) productType!: ProductType;
	@Field(() => ProductUnit) productUnit!: ProductUnit;
	@Field(() => String, { nullable: true }) productBrand?: string;
	@Field(() => String, { nullable: true }) productImage?: string;
	@Field(() => WholeSom) unitPrice!: number;
	@Field(() => Float) quantity!: number;
	@Field(() => WholeSom) lineTotal!: number;
	quantityMilli!: number;
}
@ObjectType()
export class Sale {
	@Field(() => String) _id!: ObjectId;
	@Field(() => String) clientId!: ObjectId;
	@Field(() => String) clientName!: string;
	@Field(() => String) requestKey!: string;
	requestHash!: string;
	@Field(() => SaleStatus) saleStatus!: SaleStatus;
	@Field(() => SalePaymentMethod) paymentMethod!: SalePaymentMethod;
	@Field(() => [SaleLine]) items!: SaleLine[];
	@Field(() => WholeSom) totalAmount!: number;
	@Field(() => String, { nullable: true }) agentId!: ObjectId | null;
	@Field(() => String, { nullable: true }) agentName!: string | null;
	@Field(() => String, { nullable: true }) completedDate!: string | null;
	@Field(() => Date, { nullable: true }) completedAt!: Date | null;
	@Field(() => Date, { nullable: true }) cancelledAt!: Date | null;
	@Field(() => Date, { nullable: true }) rejectedAt!: Date | null;
	@Field(() => String, { nullable: true }) rejectedById!: ObjectId | null;
	@Field(() => String, { nullable: true }) rejectedByName!: string | null;
	@Field(() => Date) createdAt!: Date;
	@Field(() => Date) updatedAt!: Date;
}
@ObjectType()
export class Sales {
	@Field(() => [Sale]) list!: Sale[];
	@Field(() => [TotalCounter]) metaCounter!: TotalCounter[];
}
@ObjectType()
export class SaleNotification {
	@Field(() => Sale) sale!: Sale;
	@Field(() => Date, { nullable: true }) readAt!: Date | null;
}
@ObjectType()
export class SaleNotifications {
	@Field(() => [SaleNotification]) list!: SaleNotification[];
	@Field(() => [TotalCounter]) metaCounter!: TotalCounter[];
	@Field(() => Int) unreadCount!: number;
}
@ObjectType()
export class SoldProductSummary {
	@Field(() => String) productId!: ObjectId;
	@Field(() => String) productName!: string;
	@Field(() => ProductUnit) productUnit!: ProductUnit;
	@Field(() => Float) quantity!: number;
	@Field(() => WholeSom) totalAmount!: number;
}
@ObjectType()
export class DailySalesReport {
	@Field(() => String) date!: string;
	@Field(() => Int) salesCount!: number;
	@Field(() => WholeSom) totalAmount!: number;
	@Field(() => [SoldProductSummary]) products!: SoldProductSummary[];
}
