import { registerEnumType } from '@nestjs/graphql';

export enum ViewGroup {
	MEMBER = 'MEMBER',
	PRODUCT = 'PRODUCT',
}
registerEnumType(ViewGroup, {
	name: 'ViewGroup',
});
