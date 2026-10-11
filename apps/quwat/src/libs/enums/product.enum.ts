import { registerEnumType } from '@nestjs/graphql';
export enum ProductType {
	ASBOBLAR = 'ASBOBLAR',
	MAHKAMLASH_BUYUMLARI = 'MAHKAMLASH_BUYUMLARI',
	SANTEXNIKA = 'SANTEXNIKA',
	ELEKTR_MOLLARI = 'ELEKTR_MOLLARI',
	BOYOQ_VA_YELIMLAR = 'BOYOQ_VA_YELIMLAR',
	ESHIK_JIHOZLARI = 'ESHIK_JIHOZLARI',
	XOJALIK_BUYUMLARI = 'XOJALIK_BUYUMLARI',
}
export enum ProductStatus {
	DRAFT = 'DRAFT',
	ACTIVE = 'ACTIVE',
	ARCHIVED = 'ARCHIVED',
}
export enum ProductUnit {
	DONA = 'DONA',
	QOP = 'QOP',
	METR = 'METR',
	KG = 'KG',
}
registerEnumType(ProductType, { name: 'ProductType' });
registerEnumType(ProductStatus, { name: 'ProductStatus' });
registerEnumType(ProductUnit, { name: 'ProductUnit' });
