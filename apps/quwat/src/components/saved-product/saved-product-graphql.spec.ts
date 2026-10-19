import 'reflect-metadata';
import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { GraphQLModule, GraphQLSchemaHost } from '@nestjs/graphql';
import { ApolloDriver } from '@nestjs/apollo';
import { createConnection } from 'mongoose';
import { graphql } from 'graphql';
import { ObjectId } from 'bson';
import { SavedProductModule } from './saved-product.module';
import { ProductModule } from '../product/product.module';
import { AuthService } from '../auth/auth.service';
import { Member } from '../../libs/dto/member/member';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';

const connection = createConnection();
@Global()
@Module({ providers: [{ provide: getConnectionToken(), useValue: connection }], exports: [getConnectionToken()] })
class IsolatedDatabaseModule {}

const query = (value: unknown): any => ({ lean: () => query(value), exec: jest.fn().mockResolvedValue(value) });
const client = {
	_id: new ObjectId().toHexString(),
	memberType: MemberType.CLIENT,
	memberStatus: MemberStatus.ACTIVE,
} as Member;
const other = { ...client, _id: new ObjectId().toHexString() };
const productId = new ObjectId();
const pair = (filter: any) => `${filter.memberId}:${filter.productId}`;

describe('Saved APIs through Nest GraphQL execution (isolated storage)', () => {
	let app: INestApplication;
	let auth: AuthService;
	let currentMember: Member | null;
	let records: Set<string>;
	let productStatus: string;
	const savedModel = {
		collection: { createIndex: jest.fn().mockResolvedValue('memberId_1_productId_1') },
		updateOne: jest.fn((filter: any) => {
			records.add(pair(filter));
			return query({ upsertedCount: 1 });
		}),
		deleteOne: jest.fn((filter: any) => query({ deletedCount: Number(records.delete(pair(filter))) })),
		exists: jest.fn((filter: any) => query(records.has(pair(filter)) ? { _id: productId } : null)),
		aggregate: jest.fn(() => query([{ list: [{ _id: productId, productStatus }], metaCounter: [{ total: 1 }] }])),
	};
	const productModel = {
		exists: jest.fn(() => query(productStatus === 'ACTIVE' ? { _id: productId } : null)),
		aggregate: jest.fn(() => query([{ list: [{ _id: productId }], metaCounter: [{ total: 1 }] }])),
	};
	const memberModel = {
		findOne: jest.fn((filter: any) =>
			query(
				currentMember?.memberStatus === MemberStatus.ACTIVE && currentMember._id === String(filter._id)
					? currentMember
					: null,
			),
		),
	};

	beforeAll(async () => {
		const module = await Test.createTestingModule({
			imports: [
				ConfigModule.forRoot({
					ignoreEnvFile: true,
					ignoreEnvVars: true,
					load: [() => ({ SECRET_TOKEN: 'saved-graphql-test-secret' })],
				}),
				IsolatedDatabaseModule,
				GraphQLModule.forRoot({ driver: ApolloDriver, autoSchemaFile: true }),
				ProductModule,
				SavedProductModule,
			],
		})
			.overrideProvider(getModelToken('SavedProduct'))
			.useValue(savedModel)
			.overrideProvider(getModelToken('Product'))
			.useValue(productModel)
			.overrideProvider(getModelToken('Member'))
			.useValue(memberModel)
			.compile();
		app = module.createNestApplication({ logger: false });
		app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
		await app.init();
		auth = app.get(AuthService);
	});
	afterAll(async () => {
		await app?.close();
		await connection.close();
	});
	beforeEach(() => {
		jest.clearAllMocks();
		jest.spyOn(console, 'info').mockImplementation(() => undefined);
		jest.spyOn(console, 'log').mockImplementation(() => undefined);
		currentMember = client;
		records = new Set();
		productStatus = 'ACTIVE';
	});
	afterEach(() => {
		jest.restoreAllMocks();
	});
	async function run(source: string, signedMember: Member | null = client, variableValues: any = {}) {
		const token = signedMember ? await auth.createToken(signedMember) : null;
		return graphql({
			schema: app.get(GraphQLSchemaHost).schema,
			source,
			variableValues,
			contextValue: { req: { headers: token ? { authorization: `Bearer ${token}` } : {}, body: {} } },
		});
	}
	const save = `mutation { saveProduct(productId: "${productId}") }`;
	const unsave = `mutation { unsaveProduct(productId: "${productId}") }`;
	const saved =
		'{ getSavedProducts(input: { page: 1, limit: 10 }) { list { _id productStatus meSaved } metaCounter { total } } }';
	const catalog = '{ getProducts(input: { page: 1, limit: 10, search: {} }) { list { _id meSaved } } }';

	it('saves, reads archived cards with meSaved, and unsaves using actual guards and field resolvers', async () => {
		const created = await run(save);
		expect(created.errors).toBeUndefined();
		expect(created.data?.saveProduct).toBe(true);
		productStatus = 'ARCHIVED';
		const list = await run(saved);
		expect(list.errors).toBeUndefined();
		expect(list.data?.getSavedProducts).toEqual({
			list: [{ _id: productId.toHexString(), productStatus: 'ARCHIVED', meSaved: true }],
			metaCounter: [{ total: 1 }],
		});
		const removed = await run(unsave);
		expect(removed.errors).toBeUndefined();
		expect(removed.data?.unsaveProduct).toBe(true);
		expect((await run(unsave)).data?.unsaveProduct).toBe(true);
		expect(productModel.aggregate).not.toHaveBeenCalled();
	});
	it('resolves meSaved in the public catalog for each identity and returns false without a client', async () => {
		await run(save);
		expect((await run(catalog)).data?.getProducts).toEqual({ list: [{ _id: productId.toHexString(), meSaved: true }] });
		currentMember = other;
		expect((await run(catalog, other)).data?.getProducts).toEqual({
			list: [{ _id: productId.toHexString(), meSaved: false }],
		});
		expect((await run(catalog, null)).data?.getProducts).toEqual({
			list: [{ _id: productId.toHexString(), meSaved: false }],
		});
		currentMember = { ...client, memberType: MemberType.ADMIN };
		expect((await run(catalog)).data?.getProducts).toEqual({
			list: [{ _id: productId.toHexString(), meSaved: false }],
		});
	});
	it('keeps the saved pair through archive/restoration and reading does not resave or mutate the product', async () => {
		await run(save);
		for (const status of ['ARCHIVED', 'ACTIVE']) {
			productStatus = status;
			const result = await run(saved);
			expect(result.errors).toBeUndefined();
			expect(result.data?.getSavedProducts).toMatchObject({ list: [{ productStatus: status, meSaved: true }] });
			expect(records.size).toBe(1);
		}
		expect(savedModel.updateOne).toHaveBeenCalledTimes(1);
		expect(savedModel.deleteOne).not.toHaveBeenCalled();
	});
	it.each(['DRAFT', 'ARCHIVED', 'missing'])('cannot newly save a %s product through GraphQL', async (status) => {
		productStatus = status;
		const result = await run(save);
		expect(result.errors?.[0].message).toBe('Active product not found');
		expect(savedModel.updateOne).not.toHaveBeenCalled();
		expect(records.size).toBe(0);
	});
	it.each(['ADMIN', 'AGENT', 'BLOCK', 'DELETE', 'guest'])(
		'denies all saved APIs for %s before storage access',
		async (state) => {
			if (state === 'ADMIN' || state === 'AGENT') currentMember = { ...client, memberType: state as MemberType };
			if (state === 'BLOCK' || state === 'DELETE') currentMember = { ...client, memberStatus: state as MemberStatus };
			for (const source of [save, unsave, saved]) {
				const result = await run(source, state === 'guest' ? null : client);
				expect(result.errors?.length).toBeGreaterThan(0);
			}
			expect(savedModel.updateOne).not.toHaveBeenCalled();
			expect(savedModel.deleteOne).not.toHaveBeenCalled();
			expect(savedModel.aggregate).not.toHaveBeenCalled();
		},
	);
	it('rejects invalid identifiers, pagination and caller spoofing through the GraphQL boundary', async () => {
		for (const source of [
			'mutation { saveProduct(productId: "bad") }',
			'mutation { unsaveProduct(productId: "bad") }',
			'{ getSavedProducts(input: { page: 0, limit: 10 }) { list { _id } } }',
			'{ getSavedProducts(input: { page: 1, limit: 101 }) { list { _id } } }',
			`mutation { saveProduct(productId: "${productId}", memberId: "${other._id}") }`,
		])
			expect((await run(source)).errors?.length).toBeGreaterThan(0);
		expect(savedModel.updateOne).not.toHaveBeenCalled();
		expect(savedModel.deleteOne).not.toHaveBeenCalled();
		expect(savedModel.aggregate).not.toHaveBeenCalled();
	});
	it('accepts Postman variables and associates the write only with the verified member', async () => {
		const result = await run(
			'mutation SaveProduct($productId: String!) { saveProduct(productId: $productId) }',
			client,
			{ productId: productId.toHexString() },
		);
		expect(result.errors).toBeUndefined();
		expect(result.data?.saveProduct).toBe(true);
		expect(records.has(`${client._id}:${productId}`)).toBe(true);
		expect(records.has(`${other._id}:${productId}`)).toBe(false);
	});
});
