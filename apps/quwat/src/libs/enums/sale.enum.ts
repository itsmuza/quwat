import { registerEnumType } from '@nestjs/graphql';
export enum SaleStatus {
	PENDING = 'PENDING',
	COMPLETED = 'COMPLETED',
	CANCELLED = 'CANCELLED',
}
export enum SalePaymentMethod {
	CASH = 'CASH',
	CARD = 'CARD',
}
registerEnumType(SaleStatus, { name: 'SaleStatus' });
registerEnumType(SalePaymentMethod, { name: 'SalePaymentMethod' });
