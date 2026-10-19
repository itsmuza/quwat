import 'reflect-metadata';
import {
	GuestLikeResolver,
	ProductGuestLikeResolver,
	MemberGuestLikeResolver,
} from '../guest-like/guest-like.resolver';
import { Test } from '@nestjs/testing';
import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { GraphQLSchema, GraphQLObjectType, GraphQLInputObjectType, parse, printSchema, validate } from 'graphql';
import { ProductResolver } from './product.resolver';
import { MemberResolver } from '../member/member.resolver';
import { CommentResolver } from '../comment/comment.resolver';
import { SavedProductResolver } from '../saved-product/saved-product.resolver';
import { AttendanceResolver } from '../attendance/attendance.resolver';

describe('Generated Quwat GraphQL contract', () => {
	let schema: GraphQLSchema;
	beforeAll(async () => {
		const module = await Test.createTestingModule({
			imports: [GraphQLSchemaBuilderModule],
		}).compile();
		try {
			schema = await module
				.get(GraphQLSchemaFactory)
				.create([
					ProductResolver,
					MemberResolver,
					CommentResolver,
					SavedProductResolver,
					AttendanceResolver,
					GuestLikeResolver,
					ProductGuestLikeResolver,
					MemberGuestLikeResolver,
				]);
		} finally {
			await module.close();
		}
	});
	it('exposes anonymous like state and an explicit set operation without member identity inputs', () => {
		expect(
			validate(
				schema,
				parse(
					'mutation { setGuestLike(input: { likeRefId: "507f1f77bcf86cd799439011", likeGroup: PRODUCT, liked: true }) { likeRefId likeGroup liked likeCount } }',
				),
			),
		).toHaveLength(0);
		expect(
			validate(
				schema,
				parse(
					'mutation { setGuestLike(input: { memberId: "507f1f77bcf86cd799439011", likeRefId: "507f1f77bcf86cd799439011", likeGroup: MEMBER, liked: true }) { liked } }',
				),
			).length,
		).toBeGreaterThan(0);
		expect((schema.getType('Product') as GraphQLObjectType).getFields().guestLiked.type.toString()).toBe('Boolean!');
		expect((schema.getType('Member') as GraphQLObjectType).getFields().guestLiked.type.toString()).toBe('Boolean!');
	});
	it.each(['DONA', 'QOP', 'METR', 'KG'])('accepts localized %s in product inputs and catalog filters', (unit) => {
		expect(
			validate(
				schema,
				parse(
					`mutation { createProduct(input: { productName: "Bolga", productType: ASBOBLAR, productUnit: ${unit}, productPrice: 100 }) { _id productUnit } }`,
				),
			),
		).toHaveLength(0);
		expect(
			validate(
				schema,
				parse(
					`{ getProducts(input: { page: 1, limit: 10, search: { unitList: [${unit}] } }) { list { _id productUnit } } }`,
				),
			),
		).toHaveLength(0);
	});
	it.each(['PIECE', 'BAG', 'METER'])('rejects obsolete %s unit values', (unit) => {
		expect(
			validate(
				schema,
				parse(
					`mutation { createProduct(input: { productName: "Bolga", productType: ASBOBLAR, productUnit: ${unit}, productPrice: 100 }) { _id } }`,
				),
			).length,
		).toBeGreaterThan(0);
	});
	it('builds the complete resolver schema with product APIs and new roles', () => {
		const sdl = printSchema(schema);
		expect(sdl).toContain('createProduct(input: ProductInput!): Product!');
		expect(sdl).toContain('getFavorites(input: OrdinaryInquiry!): Products!');
		expect(sdl).toContain('saveProduct(productId: String!): Boolean!');
		expect(sdl).toContain('unsaveProduct(productId: String!): Boolean!');
		expect(sdl).toContain('getSavedProducts(input: OrdinaryInquiry!): Products!');
		expect(sdl).toContain('scalar WholeSom');
		expect(sdl).toContain('CLIENT');
		expect(sdl).not.toMatch(
			/Property|Properties|ProductSubtype|productSubtype|productSku|memberProperties|memberProducts|memberArticles|memberFollowers|memberFollowings|meFollowed|BoardArticle|ARTICLE|\bUSER\b/,
		);
		for (const operation of [
			'getAgentProperties',
			'getAgentProducts',
			'updateProductByAdmin',
			'getFollowers',
			'createBoardArticle',
		]) {
			expect(sdl).not.toContain(operation);
		}
	});
	it('keeps ownership out of products and protected fields out of inputs', () => {
		const fields = (schema.getType('Product') as GraphQLObjectType).getFields();
		expect(fields.memberId).toBeUndefined();
		expect(fields.memberData).toBeUndefined();
		expect(Object.keys(fields).sort()).toEqual(
			[
				'_id',
				'productName',
				'guestLiked',
				'productType',
				'productStatus',
				'productUnit',
				'productPrice',
				'productBrand',
				'productDesc',
				'productImages',
				'productQuantity',
				'productReservedQuantity',
				'productMinOrderQuantity',
				'productQuantityStep',
				'productViews',
				'productLikes',
				'productComments',
				'productRank',
				'archivedAt',
				'createdAt',
				'updatedAt',
				'meLiked',
				'meSaved',
			].sort(),
		);
		expect(fields.productPrice.type.toString()).toBe('WholeSom!');
		expect(fields.productQuantity.type.toString()).toBe('Float!');
		expect(fields.meSaved.type.toString()).toBe('Boolean!');
		for (const name of ['ProductInput', 'ProductUpdate']) {
			const input = (schema.getType(name) as GraphQLInputObjectType).getFields();
			expect(input.productQuantity.type.toString()).toBe('Float');
			for (const field of ['memberId', 'productReservedQuantity', 'productSubtype', 'productSku', 'meSaved'])
				expect(input[field]).toBeUndefined();
		}
		expect(
			(schema.getType('ProductUpdate') as GraphQLInputObjectType).getFields().expectedProductQuantity.type.toString(),
		).toBe('Float');
		expect(
			(schema.getType('ProductInput') as GraphQLInputObjectType).getFields().expectedProductQuantity,
		).toBeUndefined();
		for (const name of ['MemberInput', 'MemberUpdate']) {
			const input = (schema.getType(name) as GraphQLInputObjectType).getFields();
			expect(input.memberType).toBeUndefined();
			expect(input.memberStatus).toBeUndefined();
			expect(input.attendanceStartDate).toBeUndefined();
		}
		expect((schema.getType('AdminMemberUpdate') as GraphQLInputObjectType).getFields().memberType).toBeDefined();
		expect(
			(schema.getType('AdminMemberUpdate') as GraphQLInputObjectType).getFields().attendanceStartDate,
		).toBeUndefined();
		expect((schema.getType('Member') as GraphQLObjectType).getFields().attendanceStartDate).toBeUndefined();
	});
	it('accepts the public product query and rejects old operations or forged input fields', () => {
		expect(
			validate(
				schema,
				parse('{ getProducts(input: { page: 1, limit: 10, search: {} }) { list { _id productName productPrice } } }'),
			),
		).toHaveLength(0);
		expect(validate(schema, parse('{ getProperty(propertyId: "old") { _id } }')).length).toBeGreaterThan(0);
		expect(
			validate(
				schema,
				parse(
					'mutation { createProduct(input: { productName: "Bolga", productType: ASBOBLAR, productUnit: DONA, productPrice: 100, productReservedQuantity: 999 }) { _id } }',
				),
			).length,
		).toBeGreaterThan(0);
	});
});
