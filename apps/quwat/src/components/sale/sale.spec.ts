import 'reflect-metadata';
import { ObjectId } from 'bson';
import { randomUUID } from 'crypto';
import { SaleService, saleLineAmount } from './sale.service';
import { MemberType, MemberStatus } from '../../libs/enums/member.enum';
import { ProductType, ProductUnit, ProductStatus } from '../../libs/enums/product.enum';
import { SalePaymentMethod, SaleStatus } from '../../libs/enums/sale.enum';
import { attendanceToday } from '../../libs/validation/attendance-date';
import { RequestSaleInput } from '../../libs/dto/sale/sale.input';
import { Member } from '../../libs/dto/member/member';
const client = {
	_id: new ObjectId().toHexString(),
	memberNick: 'client',
	memberType: MemberType.CLIENT,
	memberStatus: MemberStatus.ACTIVE,
} as Member;
const agent = { ...client, _id: new ObjectId().toHexString(), memberNick: 'agent', memberType: MemberType.AGENT };
const admin = { ...client, _id: new ObjectId().toHexString(), memberType: MemberType.ADMIN };
const productId = new ObjectId().toHexString(),
	secondId = new ObjectId().toHexString();
const copy = (value: any) => JSON.parse(JSON.stringify(value));
const matches = (value: any, filter: any) =>
	Object.entries(filter).every(([key, expected]) => String(value[key]) === String(expected));

describe('Transactional sale requests, reservations, approvals and reports (isolated storage)', () => {
	let products: any[], sales: any[], service: SaleService, connection: any, saleModel: any, productModel: any;
	let session: any, tail: Promise<void>;
	const query = (fn: () => any): any => {
		let selected: any;
		const q = {
			session: (s: any) => {
				selected = s;
				return q;
			},
			lean: () => q,
			exec: async () => {
				if (session && selected !== session) throw new Error('Transaction read missing session');
				return copy(fn());
			},
		};
		return q;
	};
	const input = (extra: Partial<RequestSaleInput> = {}): RequestSaleInput => ({
		requestKey: randomUUID(),
		paymentMethod: SalePaymentMethod.CASH,
		expectedTotal: 50000,
		items: [{ productId, quantity: 2, expectedProductUnit: ProductUnit.DONA, expectedUnitPrice: 25000 }],
		...extra,
	});
	beforeEach(() => {
		products = [productId, secondId].map((_id) => ({
			_id,
			productName: _id === productId ? 'Bolg‘a' : 'Quvur',
			productType: ProductType.ASBOBLAR,
			productUnit: ProductUnit.DONA,
			productStatus: ProductStatus.ACTIVE,
			productPrice: 25000,
			productQuantity: 10,
			productReservedQuantity: 0,
			productMinOrderQuantity: 1,
			productQuantityStep: 1,
			productImages: [],
		}));
		sales = [];
		session = undefined;
		tail = Promise.resolve();
		connection = {
			transaction: jest.fn(async (callback) => {
				const previous = tail;
				let release!: () => void;
				tail = new Promise<void>((resolve) => {
					release = resolve;
				});
				await previous;
				const originalProducts = copy(products),
					originalSales = copy(sales);
				session = {};
				try {
					return await callback(session);
				} catch (e) {
					products = originalProducts;
					sales = originalSales;
					throw e;
				} finally {
					session = undefined;
					release();
				}
			}),
		};
		productModel = {
			findById: jest.fn((id) => query(() => products.find((p) => p._id === String(id)) || null)),
			updateOne: jest.fn((filter, update, options) => ({
				exec: async () => {
					expect(options.session).toBe(session);
					const p = products.find((p) => matches(p, filter));
					if (!p) return { matchedCount: 0 };
					Object.assign(p, update.$set);
					return { matchedCount: 1 };
				},
			})),
		};
		saleModel = {
			collection: { createIndex: jest.fn().mockResolvedValue('clientId_1_requestKey_1') },
			findOne: jest.fn((filter) => query(() => sales.find((s) => matches(s, filter)) || null)),
			create: jest.fn(async (docs, options) => {
				expect(options.session).toBe(session);
				const now = new Date();
				const doc = {
					...copy(docs[0]),
					_id: new ObjectId().toHexString(),
					agentId: null,
					agentName: null,
					completedAt: null,
					completedDate: null,
					cancelledAt: null,
					createdAt: now.toISOString(),
					updatedAt: now.toISOString(),
				};
				sales.push(doc);
				return [{ toObject: () => copy(doc) }];
			}),
			findOneAndUpdate: jest.fn((filter, update, options) => {
				const q = query(() => {
					const sale = sales.find((s) => matches(s, filter));
					if (!sale) return null;
					Object.assign(sale, copy(update.$set));
					return sale;
				});
				q.session(options.session);
				return q;
			}),
			aggregate: jest.fn((pipeline) =>
				query(() => {
					const list = sales.filter((s) => matches(s, pipeline[0].$match));
					const facet = pipeline.find((p) => p.$facet).$facet;
					if (facet.totals) {
						const groups = new Map<string, any>();
						for (const s of list)
							for (const line of s.items) {
								const key = `${line.productId}:${line.productUnit}`;
								const row = groups.get(key) || {
									productId: line.productId,
									productUnit: line.productUnit,
									productName: line.productName,
									quantity: 0,
									totalAmount: 0,
								};
								row.quantity += line.quantityMilli / 1000;
								row.totalAmount += line.lineTotal;
								groups.set(key, row);
							}
						return [
							{
								totals: [{ salesCount: list.length, totalAmount: list.reduce((sum, s) => sum + s.totalAmount, 0) }],
								products: [...groups.values()],
							},
						];
					}
					const skip = facet.list[0].$skip,
						limit = facet.list[1].$limit;
					return [{ list: list.slice(skip, skip + limit), metaCounter: list.length ? [{ total: list.length }] : [] }];
				}),
			),
		};
		service = new SaleService(saleModel, productModel, connection);
	});
	it('reserves stock without taking payment and retries the identical request without reserving twice', async () => {
		const request = input();
		const sale = await service.requestSale(client, request);
		expect(sale.saleStatus).toBe(SaleStatus.PENDING);
		expect(sale.totalAmount).toBe(50000);
		expect(products[0]).toMatchObject({ productQuantity: 10, productReservedQuantity: 2 });
		expect((await service.requestSale(client, request))._id).toBe(sale._id);
		expect(saleModel.create).toHaveBeenCalledTimes(1);
		expect(products[0].productReservedQuantity).toBe(2);
		await expect(
			service.requestSale(client, { ...request, expectedTotal: 75000, items: [{ ...request.items[0], quantity: 3 }] }),
		).rejects.toThrow('already used');
	});
	it('atomically records approval, decreases quantity once and preserves snapshots after catalogue edits', async () => {
		const sale = await service.requestSale(client, input());
		products[0].productName = 'Renamed';
		products[0].productPrice = 99999;
		products[0].productStatus = ProductStatus.ARCHIVED;
		const completed = await service.approveSale(agent, { _id: String(sale._id) });
		expect(completed).toMatchObject({
			saleStatus: SaleStatus.COMPLETED,
			totalAmount: 50000,
			agentId: agent._id,
			completedDate: attendanceToday(),
		});
		expect(completed.items[0]).toMatchObject({ productName: 'Bolg‘a', unitPrice: 25000, quantity: 2 });
		expect(products[0]).toMatchObject({ productQuantity: 8, productReservedQuantity: 0 });
		expect(
			(await service.approveSale({ ...agent, _id: new ObjectId().toHexString() }, { _id: String(sale._id) })).agentId,
		).toBe(agent._id);
		expect(products[0].productQuantity).toBe(8);
		await expect(service.cancelSale(client, { _id: String(sale._id) })).rejects.toThrow('final decision');
	});
	it('cancellation releases only the owner reservation, is idempotent and cannot become completed', async () => {
		const sale = await service.requestSale(client, input());
		await expect(
			service.cancelSale({ ...client, _id: new ObjectId().toHexString() }, { _id: String(sale._id) }),
		).rejects.toThrow('not found');
		const cancelled = await service.cancelSale(client, { _id: String(sale._id) });
		expect(cancelled.saleStatus).toBe(SaleStatus.CANCELLED);
		expect(products[0]).toMatchObject({ productQuantity: 10, productReservedQuantity: 0 });
		expect((await service.cancelSale(client, { _id: String(sale._id) })).cancelledAt).toEqual(cancelled.cancelledAt);
		await expect(service.approveSale(agent, { _id: String(sale._id) })).rejects.toThrow('final decision');
	});
	it('a failed later product or expected-total conflict rolls the entire reservation back', async () => {
		products[1].productQuantity = 0;
		await expect(
			service.requestSale(
				client,
				input({
					expectedTotal: 100000,
					items: [
						{ productId, quantity: 2, expectedProductUnit: ProductUnit.DONA, expectedUnitPrice: 25000 },
						{ productId: secondId, quantity: 2, expectedProductUnit: ProductUnit.DONA, expectedUnitPrice: 25000 },
					],
				}),
			),
		).rejects.toThrow('stock');
		expect(products.every((p) => p.productReservedQuantity === 0)).toBe(true);
		expect(sales).toHaveLength(0);
		await expect(service.requestSale(client, input({ expectedTotal: 1 }))).rejects.toThrow('total changed');
		expect(products[0].productReservedQuantity).toBe(0);
		expect(sales).toHaveLength(0);
	});
	it('approval failures roll back all product changes and retain the pending request', async () => {
		const sale = await service.requestSale(
			client,
			input({
				expectedTotal: 100000,
				items: [
					{ productId, quantity: 2, expectedProductUnit: ProductUnit.DONA, expectedUnitPrice: 25000 },
					{ productId: secondId, quantity: 2, expectedProductUnit: ProductUnit.DONA, expectedUnitPrice: 25000 },
				],
			}),
		);
		products[1].productReservedQuantity = 0;
		await expect(service.approveSale(agent, { _id: String(sale._id) })).rejects.toThrow('reservation');
		expect(products[0]).toMatchObject({ productQuantity: 10, productReservedQuantity: 2 });
		expect(sales[0].saleStatus).toBe(SaleStatus.PENDING);
	});
	it('concurrent reservations cannot oversell and concurrent reviewers cannot sell twice', async () => {
		const results = await Promise.allSettled([
			service.requestSale(
				client,
				input({
					expectedTotal: 150000,
					items: [{ productId, quantity: 6, expectedProductUnit: ProductUnit.DONA, expectedUnitPrice: 25000 }],
				}),
			),
			service.requestSale(
				client,
				input({
					expectedTotal: 150000,
					items: [{ productId, quantity: 6, expectedProductUnit: ProductUnit.DONA, expectedUnitPrice: 25000 }],
				}),
			),
		]);
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		expect(products[0].productReservedQuantity).toBe(6);
		await Promise.all([
			service.approveSale(agent, { _id: sales[0]._id }),
			service.approveSale({ ...agent, _id: new ObjectId().toHexString() }, { _id: sales[0]._id }),
		]);
		expect(products[0]).toMatchObject({ productQuantity: 4, productReservedQuantity: 0 });
		expect(sales).toHaveLength(1);
	});
	it('agent rejection releases reservations, records the rejecting agent and is idempotent', async () => {
		const sale = await service.requestSale(client, input());
		const rejected = await service.rejectSale(agent, { _id: String(sale._id) });
		expect(rejected).toMatchObject({
			saleStatus: SaleStatus.CANCELLED,
			rejectedById: agent._id,
			rejectedByName: agent.memberNick,
		});
		expect(rejected.rejectedAt).toBeTruthy();
		expect(products[0]).toMatchObject({ productQuantity: 10, productReservedQuantity: 0 });
		expect((await service.rejectSale(agent, { _id: String(sale._id) })).rejectedAt).toEqual(rejected.rejectedAt);
		await expect(service.approveSale(agent, { _id: String(sale._id) })).rejects.toThrow('final decision');
	});
	it('reject is agent-only and cannot undo completed sales or spoof the agent', async () => {
		for (const member of [client, admin, { ...agent, memberStatus: MemberStatus.BLOCK }])
			await expect(service.rejectSale(member, { _id: productId })).rejects.toThrow();
		await expect(service.rejectSale(agent, { _id: productId, agentId: client._id } as any)).rejects.toThrow(
			'Invalid sale input',
		);
		const sale = await service.requestSale(client, input());
		await service.approveSale(agent, { _id: String(sale._id) });
		await expect(service.rejectSale(agent, { _id: String(sale._id) })).rejects.toThrow('final decision');
		expect(products[0]).toMatchObject({ productQuantity: 8, productReservedQuantity: 0 });
	});
	it('does not relabel a client cancellation as agent rejection', async () => {
		const sale = await service.requestSale(client, input());
		await service.cancelSale(client, { _id: String(sale._id) });
		await expect(service.rejectSale(agent, { _id: String(sale._id) })).rejects.toThrow('final decision');
		expect(sales[0].rejectedAt).toBeUndefined();
		expect(products[0]).toMatchObject({ productQuantity: 10, productReservedQuantity: 0 });
	});
	it('emits agent hints after successful commit and never for rolled-back requests', async () => {
		const socket = { notifySaleChanged: jest.fn().mockResolvedValue(undefined) };
		service = new SaleService(saleModel, productModel, connection, socket as any);
		await expect(service.requestSale(client, input({ expectedTotal: 123 }))).rejects.toThrow('total changed');
		expect(socket.notifySaleChanged).not.toHaveBeenCalled();
		const sale = await service.requestSale(client, input());
		expect(socket.notifySaleChanged).toHaveBeenCalledTimes(1);
		await service.rejectSale(agent, { _id: String(sale._id) });
		expect(socket.notifySaleChanged).toHaveBeenCalledTimes(2);
	});
	it('competing approval and rejection make one final decision and stock change', async () => {
		const sale = await service.requestSale(client, input());
		const results = await Promise.allSettled([
			service.rejectSale(agent, { _id: String(sale._id) }),
			service.approveSale(agent, { _id: String(sale._id) }),
		]);
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		expect(products[0]).toMatchObject({ productQuantity: 10, productReservedQuantity: 0 });
	});
	it('competing approve/cancel requests choose a single final state', async () => {
		const sale = await service.requestSale(client, input());
		const results = await Promise.allSettled([
			service.approveSale(agent, { _id: String(sale._id) }),
			service.cancelSale(client, { _id: String(sale._id) }),
		]);
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		expect(products[0]).toMatchObject({ productQuantity: 8, productReservedQuantity: 0 });
	});
	it.each([MemberType.ADMIN, MemberType.AGENT])('denies %s order creation before any storage call', async (role) => {
		await expect(service.requestSale({ ...client, memberType: role }, input())).rejects.toThrow();
		expect(connection.transaction).not.toHaveBeenCalled();
	});
	it('enforces agent approvals, admin-only reports and active status', async () => {
		for (const member of [client, admin, { ...agent, memberStatus: MemberStatus.BLOCK }])
			await expect(service.approveSale(member, { _id: productId })).rejects.toThrow();
		await expect(service.requestSale({ ...client, memberStatus: MemberStatus.DELETE }, input())).rejects.toThrow();
		expect(() => service.getMySales(agent, { page: 1, limit: 20 })).toThrow();
		expect(() => service.getPendingSales(client, { page: 1, limit: 20 })).toThrow();
		await expect(service.getDailySalesByAdmin(agent, {})).rejects.toThrow();
		expect(connection.transaction).not.toHaveBeenCalled();
	});
	it('validates identifiers, duplicate lines, scalar prices, quantities, payload identity and pagination', async () => {
		const req = input();
		for (const bad of [
			{ requestKey: 'bad' },
			{ items: [] },
			{ items: [req.items[0], req.items[0]] },
			{ expectedTotal: -1 },
			{ expectedTotal: 0.5 },
			{ clientId: agent._id },
			{ items: [{ ...req.items[0], productId: 'bad' }] },
			{ items: [{ ...req.items[0], quantity: 0.0001 }] },
		])
			await expect(service.requestSale(client, { ...req, ...bad } as any)).rejects.toThrow();
		await expect(service.requestSale(client, input({ items: [{ ...req.items[0], quantity: 1.5 }] }))).rejects.toThrow(
			'quantity',
		);
		await expect(
			service.requestSale(
				client,
				input({ items: [{ ...req.items[0], expectedProductUnit: ProductUnit.DONA, expectedUnitPrice: 1 }] }),
			),
		).rejects.toThrow('price changed');
		expect(() => service.getMySales(client, { page: 0, limit: 20 })).toThrow();
		await expect(service.getDailySalesByAdmin(admin, { date: '2026-02-30' })).rejects.toThrow();
	});
	it('metric quantities keep exact whole-so‘m rounding and precision across reserve/sale', async () => {
		products[0] = {
			...products[0],
			productUnit: ProductUnit.KG,
			productMinOrderQuantity: 0.001,
			productQuantityStep: 0.001,
			productPrice: 100,
			productQuantity: 0.3,
			productReservedQuantity: 0.1,
		};
		const sale = await service.requestSale(
			client,
			input({
				expectedTotal: 1,
				items: [{ productId, quantity: 0.005, expectedProductUnit: ProductUnit.KG, expectedUnitPrice: 100 }],
			}),
		);
		expect(sale.totalAmount).toBe(1);
		expect(products[0].productReservedQuantity).toBe(0.105);
		await service.approveSale(agent, { _id: String(sale._id) });
		expect(products[0]).toMatchObject({ productQuantity: 0.295, productReservedQuantity: 0.1 });
		expect(saleLineAmount(4000000000, 2)).toBe(8000000000);
		expect(() => saleLineAmount(Number.MAX_SAFE_INTEGER, 2)).toThrow('safe integer');
	});
	it('daily reporting counts only completed sales with snapshot products on the completion day', async () => {
		const complete = await service.requestSale(client, input());
		await service.approveSale(agent, { _id: String(complete._id) });
		await service.requestSale(client, input());
		const cancelled = await service.requestSale(client, input());
		await service.cancelSale(client, { _id: String(cancelled._id) });
		const report = await service.getDailySalesByAdmin(admin, {});
		expect(report).toMatchObject({
			date: attendanceToday(),
			salesCount: 1,
			totalAmount: 50000,
			products: [{ productId, quantity: 2, totalAmount: 50000 }],
		});
		expect((await service.getDailySalesByAdmin(admin, { date: '2026-01-01' })).salesCount).toBe(0);
		expect(saleModel.aggregate.mock.calls[0][0][0]).toEqual({
			$match: { saleStatus: SaleStatus.COMPLETED, completedDate: attendanceToday() },
		});
		expect(
			(await service.getMySales({ ...client, _id: new ObjectId().toHexString() }, { page: 1, limit: 20 })).list,
		).toHaveLength(0);
		expect((await service.getPendingSales(agent, { page: 1, limit: 20 })).list).toHaveLength(1);
	});
	it('fails safely on a standalone database without applying reservations', async () => {
		connection.transaction.mockRejectedValue(
			Object.assign(new Error('Transaction numbers are only allowed on a replica set member'), { code: 20 }),
		);
		await expect(service.requestSale(client, input())).rejects.toThrow('replica set');
		expect(products[0].productReservedQuantity).toBe(0);
	});
});
