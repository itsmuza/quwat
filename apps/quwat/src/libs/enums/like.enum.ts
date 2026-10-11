import { registerEnumType } from '@nestjs/graphql';

export enum LikeGroup {
	MEMBER = 'MEMBER',
	PRODUCT = 'PRODUCT',
}
registerEnumType(LikeGroup, {
	name: 'LikeGroup',
});
