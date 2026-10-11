import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { GraphQLSchema, GraphQLObjectType, GraphQLInputObjectType, parse, printSchema, validate } from 'graphql';
import { ProductResolver } from './product.resolver';
import { MemberResolver } from '../member/member.resolver';
import { CommentResolver } from '../comment/comment.resolver';

describe('Generated Quwat GraphQL contract', () => {
	let schema: GraphQLSchema;
	beforeAll(async () => {
		const module = await Test.createTestingModule({ imports: [GraphQLSchemaBuilderModule] }).compile();
		try {
			schema = await module.get(GraphQLSchemaFactory).create([ProductResolver, MemberResolver, CommentResolver]);
		} finally {
			await module.close();
		}
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
			].sort(),
		);
		expect(fields.productPrice.type.toString()).toBe('WholeSom!');
		expect(fields.productQuantity.type.toString()).toBe('Float!');
		for (const name of ['ProductInput', 'ProductUpdate']) {
			const input = (schema.getType(name) as GraphQLInputObjectType).getFields();
			for (const field of ['memberId', 'productQuantity', 'productReservedQuantity', 'productSubtype', 'productSku'])
				expect(input[field]).toBeUndefined();
		}
		for (const name of ['MemberInput', 'MemberUpdate']) {
			const input = (schema.getType(name) as GraphQLInputObjectType).getFields();
			expect(input.memberType).toBeUndefined();
			expect(input.memberStatus).toBeUndefined();
		}
		expect((schema.getType('AdminMemberUpdate') as GraphQLInputObjectType).getFields().memberType).toBeDefined();
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
					'mutation { createProduct(input: { productName: "Bolga", productType: ASBOBLAR, productUnit: DONA, productPrice: 100, productQuantity: 999 }) { _id } }',
				),
			).length,
		).toBeGreaterThan(0);
	});
});
