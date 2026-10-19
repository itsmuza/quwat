import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { GraphQLModule, GraphQLSchemaHost } from '@nestjs/graphql';
import { ApolloDriver } from '@nestjs/apollo';
import { graphql, printSchema } from 'graphql';
import { writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { ObjectId } from 'bson';
import { SaleResolver } from './sale.resolver';
import { SaleService } from './sale.service';
import { SaleInboxService } from './sale-inbox.service';
import { AuthService } from '../auth/auth.service';
import { ProductUnit } from '../../libs/enums/product.enum';
import { MemberType, MemberStatus } from '../../libs/enums/member.enum';
const id = new ObjectId().toHexString(),
	productId = new ObjectId().toHexString();
const sale = {
	_id: id,
	clientId: id,
	clientName: 'Test client',
	requestKey: randomUUID(),
	saleStatus: 'PENDING',
	paymentMethod: 'CASH',
	items: [
		{
			productId,
			productName: 'Bolg‘a',
			productType: 'ASBOBLAR',
			productUnit: 'DONA',
			unitPrice: 4000000000,
			quantity: 1,
			lineTotal: 4000000000,
		},
	],
	totalAmount: 4000000000,
	createdAt: new Date(),
	updatedAt: new Date(),
	completedAt: null,
	cancelledAt: null,
	completedDate: null,
	agentId: null,
	agentName: null,
};
describe('Sales GraphQL permissions and strict input contract (no database)', () => {
	let app: INestApplication;
	let member: any;
	const service = Object.fromEntries(
		[
			'requestSale',
			'approveSale',
			'rejectSale',
			'getSaleNotifications',
			'getSaleForAgent',
			'markSaleNotificationRead',
			'cancelSale',
			'getMySales',
			'getPendingSales',
			'getAllSalesByAdmin',
			'getDailySalesByAdmin',
		].map((name) => [name, jest.fn()]),
	);
	beforeAll(async () => {
		const module = await Test.createTestingModule({
			imports: [GraphQLModule.forRoot({ driver: ApolloDriver, autoSchemaFile: true })],
			providers: [
				SaleResolver,
				{ provide: SaleService, useValue: service },
				{ provide: SaleInboxService, useValue: service },
				{
					provide: AuthService,
					useValue: {
						verifyToken: jest.fn(async () => {
							if (!member || member.memberStatus !== 'ACTIVE') throw new Error('Not authenticated');
							return member;
						}),
					},
				},
			],
		}).compile();
		app = module.createNestApplication({ logger: false });
		app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
		await app.init();
		if (process.env.QUWAT_SCHEMA_OUT)
			writeFileSync(process.env.QUWAT_SCHEMA_OUT, printSchema(app.get(GraphQLSchemaHost).schema));
	});
	afterAll(async () => {
		await app?.close();
	});
	beforeEach(() => {
		jest.clearAllMocks();
		jest.spyOn(console, 'info').mockImplementation(() => undefined);
		jest.spyOn(console, 'log').mockImplementation(() => undefined);
		member = { _id: id, memberNick: 'test', memberType: MemberType.CLIENT, memberStatus: MemberStatus.ACTIVE };
		for (const name of ['requestSale', 'approveSale', 'cancelSale', 'rejectSale', 'getSaleForAgent'])
			service[name].mockResolvedValue(sale);
		service.getSaleNotifications.mockResolvedValue({
			list: [{ sale, readAt: null }],
			metaCounter: [{ total: 1 }],
			unreadCount: 1,
		});
		service.markSaleNotificationRead.mockResolvedValue(true);
		for (const name of ['getMySales', 'getPendingSales', 'getAllSalesByAdmin'])
			service[name].mockResolvedValue({ list: [sale], metaCounter: [{ total: 1 }] });
		service.getDailySalesByAdmin.mockResolvedValue({
			date: '2026-10-13',
			salesCount: 1,
			totalAmount: 4000000000,
			products: [],
		});
	});
	afterEach(() => jest.restoreAllMocks());
	async function run(source: string, input: any, signed = true) {
		return graphql({
			schema: app.get(GraphQLSchemaHost).schema,
			source,
			variableValues: { input },
			contextValue: { req: { headers: signed ? { authorization: 'Bearer test' } : {}, body: {} } },
		});
	}
	const request =
		'mutation RequestSale($input: RequestSaleInput!) { requestSale(input: $input) { _id totalAmount items { unitPrice quantity } } }';
	const fields = () => ({
		requestKey: randomUUID(),
		paymentMethod: 'CASH',
		expectedTotal: 4000000000,
		items: [{ productId, quantity: 1, expectedProductUnit: ProductUnit.DONA, expectedUnitPrice: 4000000000 }],
	});
	it('accepts WholeSom prices above GraphQL Int and derives the client from verified authentication', async () => {
		const input = fields();
		const result = await run(request, input);
		expect(result.errors).toBeUndefined();
		expect(result.data?.requestSale).toMatchObject({ totalAmount: 4000000000 });
		expect(service.requestSale).toHaveBeenCalledWith(member, expect.objectContaining(input));
	});
	it.each(['ADMIN', 'AGENT', 'BLOCK', 'DELETE', 'guest'])(
		'denies sale requests for %s before service calls',
		async (state) => {
			if (['ADMIN', 'AGENT'].includes(state)) member.memberType = state;
			if (['BLOCK', 'DELETE'].includes(state)) member.memberStatus = state;
			expect((await run(request, fields(), state !== 'guest')).errors?.length).toBeGreaterThan(0);
			expect(service.requestSale).not.toHaveBeenCalled();
		},
	);
	it('rejects identity spoofing, unsupported payment types, invalid IDs and invalid quantity before storage', async () => {
		for (const invalid of [
			{ clientId: id },
			{ paymentMethod: 'CREDIT' },
			{ requestKey: 'bad' },
			{ items: [] },
			{ items: [{ productId: 'bad', quantity: 1, expectedProductUnit: ProductUnit.DONA, expectedUnitPrice: 1 }] },
			{ items: [{ productId, quantity: 0.0001, expectedProductUnit: ProductUnit.DONA, expectedUnitPrice: 1 }] },
			{ expectedTotal: 0.5 },
		])
			expect((await run(request, { ...fields(), ...invalid })).errors?.length).toBeGreaterThan(0);
		expect(service.requestSale).not.toHaveBeenCalled();
	});
	it.each([
		['CLIENT', 'cancelSale', 'SaleIdInput', '{_id}', { _id: id }],
		['CLIENT', 'getMySales', 'SalesInquiry', '{list{_id}}', { page: 1, limit: 20 }],
		['AGENT', 'approveSale', 'SaleIdInput', '{_id}', { _id: id }],
		['AGENT', 'rejectSale', 'SaleIdInput', '{_id rejectedAt rejectedById}', { _id: id }],
		['AGENT', 'getSaleForAgent', 'SaleIdInput', '{_id}', { _id: id }],
		[
			'AGENT',
			'getSaleNotifications',
			'OrdinaryInquiry',
			'{list{sale{_id}readAt}unreadCount metaCounter{total}}',
			{ page: 1, limit: 10 },
		],
		['AGENT', 'markSaleNotificationRead', 'SaleIdInput', '', { _id: id }],
		['AGENT', 'getPendingSales', 'OrdinaryInquiry', '{list{_id}}', { page: 1, limit: 20 }],
		['ADMIN', 'getAllSalesByAdmin', 'AdminSalesInquiry', '{list{_id}}', { page: 1, limit: 20, date: '2026-10-13' }],
		['ADMIN', 'getDailySalesByAdmin', 'DailySalesInput', '{date totalAmount}', { date: '2026-10-13' }],
	])('only %s can access %s', async (role, operation, inputType, selection, input) => {
		const kind = ['cancelSale', 'approveSale', 'rejectSale', 'markSaleNotificationRead'].includes(String(operation))
			? 'mutation'
			: 'query';
		const source = `${kind} Operation($input: ${inputType}!) { ${operation}(input: $input) ${selection} }`;
		for (const testedRole of ['CLIENT', 'AGENT', 'ADMIN']) {
			member.memberType = testedRole;
			const result = await run(source, input);
			if (testedRole === role) expect(result.errors).toBeUndefined();
			else expect(result.errors?.length).toBeGreaterThan(0);
		}
		expect(service[String(operation)]).toHaveBeenCalledTimes(1);
	});
	it('does not expose internal request hashes or integer quantity storage fields', () => {
		const schema = printSchema(app.get(GraphQLSchemaHost).schema);
		expect(schema).not.toContain('requestHash');
		expect(schema).not.toContain('quantityMilli');
	});
});
