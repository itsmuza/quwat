import 'reflect-metadata';
import { ObjectId } from 'bson';
import { createConnection } from 'mongoose';
import { SavedProductService } from './saved-product.service';
import { SavedProductResolver } from './saved-product.resolver';
import SavedProductSchema from '../../libs/schemas/SavedProduct.model';
import ProductSchema from '../../libs/schemas/Product.model';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { Member } from '../../libs/dto/member/member';

const client = { _id: new ObjectId(), memberType: MemberType.CLIENT, memberStatus: MemberStatus.ACTIVE } as Member;
const id = new ObjectId();
const query = (value: unknown): any => ({ exec: jest.fn().mockResolvedValue(value) });

describe('Saved product operations', () => {
	let saved: any, products: any, service: SavedProductService;
	beforeEach(() => {
		saved = {
			collection: { createIndex: jest.fn().mockResolvedValue('memberId_1_productId_1') },
			updateOne: jest.fn().mockReturnValue(query({ upsertedCount: 1 })),
			deleteOne: jest.fn().mockReturnValue(query({ deletedCount: 0 })),
			exists: jest.fn().mockReturnValue(query({ _id: new ObjectId() })),
			aggregate: jest.fn().mockReturnValue(query([])),
		};
		products = { exists: jest.fn().mockReturnValue(query({ _id: id })) };
		service = new SavedProductService(saved, products);
	});
	it.each([
		null,
		{ ...client, memberType: MemberType.ADMIN },
		{ ...client, memberType: MemberType.AGENT },
		{ ...client, memberStatus: MemberStatus.BLOCK },
		{ ...client, memberStatus: MemberStatus.DELETE },
	])('rejects non-active clients in all operations before touching storage: %j', async (member) => {
		await expect(service.saveProduct(member as Member, id.toHexString())).rejects.toThrow('Only active clients');
		await expect(service.unsaveProduct(member as Member, id.toHexString())).rejects.toThrow('Only active clients');
		await expect(service.getSavedProducts(member as Member, { page: 1, limit: 10 })).rejects.toThrow(
			'Only active clients',
		);
		expect(products.exists).not.toHaveBeenCalled();
		expect(saved.updateOne).not.toHaveBeenCalled();
		expect(saved.deleteOne).not.toHaveBeenCalled();
		expect(saved.aggregate).not.toHaveBeenCalled();
	});
	it.each(['invalid', '', '123456789012', 'z'.repeat(24)])(
		'rejects malformed ids in save and unsave: %s',
		async (value) => {
			await expect(service.saveProduct(client, value)).rejects.toThrow('Invalid productId');
			await expect(service.unsaveProduct(client, value)).rejects.toThrow('Invalid productId');
			expect(products.exists).not.toHaveBeenCalled();
			expect(saved.deleteOne).not.toHaveBeenCalled();
		},
	);
	it('requires an ACTIVE product, does not require stock, and uses only insert changes on repeats', async () => {
		await expect(service.saveProduct(client, id.toHexString())).resolves.toBe(true);
		await expect(service.saveProduct(client, id.toHexString())).resolves.toBe(true);
		expect(products.exists).toHaveBeenCalledWith({ _id: id, productStatus: 'ACTIVE' });
		expect(saved.collection.createIndex).toHaveBeenCalledTimes(1);
		expect(saved.collection.createIndex).toHaveBeenCalledWith({ memberId: 1, productId: 1 }, { unique: true });
		for (const [filter, update, options] of saved.updateOne.mock.calls) {
			expect(filter).toEqual({ memberId: client._id, productId: id });
			expect(Object.keys(update)).toEqual(['$setOnInsert']);
			expect(update.$setOnInsert).toEqual({ ...filter, createdAt: expect.any(Date), updatedAt: expect.any(Date) });
			expect(options).toEqual({ upsert: true, runValidators: true, timestamps: false });
		}
	});
	it('rejects missing, draft or archived targets instead of inserting a save', async () => {
		products.exists.mockReturnValue(query(null));
		await expect(service.saveProduct(client, id.toHexString())).rejects.toThrow('Active product not found');
		expect(saved.updateOne).not.toHaveBeenCalled();
	});
	it('awaits unique-index readiness before parallel upserts', async () => {
		let ready!: (name: string) => void;
		saved.collection.createIndex.mockReturnValue(
			new Promise<string>((resolve) => {
				ready = resolve;
			}),
		);
		const first = service.saveProduct(client, id.toHexString());
		const second = service.saveProduct(client, id.toHexString());
		await new Promise((resolve) => setImmediate(resolve));
		expect(saved.updateOne).not.toHaveBeenCalled();
		expect(saved.collection.createIndex).toHaveBeenCalledTimes(1);
		ready('memberId_1_productId_1');
		await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
	});
	it('does not write after an index failure and retries index installation', async () => {
		saved.collection.createIndex.mockRejectedValueOnce(new Error('index unavailable'));
		await expect(service.saveProduct(client, id.toHexString())).rejects.toThrow('index unavailable');
		expect(saved.updateOne).not.toHaveBeenCalled();
		await expect(service.saveProduct(client, id.toHexString())).resolves.toBe(true);
		expect(saved.collection.createIndex).toHaveBeenCalledTimes(2);
	});
	it('accepts a duplicate-key race only after confirming the exact member/product pair', async () => {
		const error = { code: 11000 };
		saved.updateOne.mockReturnValue({ exec: jest.fn().mockRejectedValue(error) });
		await expect(service.saveProduct(client, id.toHexString())).resolves.toBe(true);
		expect(saved.exists).toHaveBeenCalledWith({ memberId: client._id, productId: id });
		saved.exists.mockReturnValue(query(null));
		await expect(service.saveProduct(client, id.toHexString())).rejects.toBe(error);
	});
	it('propagates other storage failures instead of claiming success', async () => {
		const error = new Error('connection lost');
		saved.updateOne.mockReturnValue({ exec: jest.fn().mockRejectedValue(error) });
		await expect(service.saveProduct(client, id.toHexString())).rejects.toBe(error);
		expect(saved.exists).not.toHaveBeenCalled();
		saved.deleteOne.mockReturnValue({ exec: jest.fn().mockRejectedValue(error) });
		await expect(service.unsaveProduct(client, id.toHexString())).rejects.toBe(error);
	});
	it('unsaves only the caller pair, without requiring a product, and missing/repeated removal succeeds', async () => {
		await expect(service.unsaveProduct(client, id.toHexString())).resolves.toBe(true);
		await expect(service.unsaveProduct(client, id.toHexString())).resolves.toBe(true);
		const other = { ...client, _id: new ObjectId() };
		await service.unsaveProduct(other, id.toHexString());
		expect(saved.deleteOne.mock.calls.map(([filter]) => filter)).toEqual([
			{ memberId: client._id, productId: id },
			{ memberId: client._id, productId: id },
			{ memberId: other._id, productId: id },
		]);
		expect(products.exists).not.toHaveBeenCalled();
	});
	it.each([
		{ page: 0, limit: 10 },
		{ page: 1, limit: 101 },
		{ page: 1.5, limit: 1 },
		{ page: 1, limit: 0 },
		{ page: 1, limit: 10, memberId: id },
	])('rejects invalid or forged pagination input %j', async (input) => {
		await expect(service.getSavedProducts(client, input)).rejects.toThrow('Invalid saved products input');
		expect(saved.aggregate).not.toHaveBeenCalled();
	});
	it('filters caller/visibility before pagination and count, keeps archived cards and never edits product statistics', async () => {
		const result = { list: [{ _id: id, productStatus: 'ARCHIVED' }], metaCounter: [{ total: 1 }] };
		saved.aggregate.mockReturnValue(query([result]));
		expect(await service.getSavedProducts(client, { page: 2, limit: 10 })).toEqual(result);
		const pipeline = saved.aggregate.mock.calls[0][0];
		expect(pipeline[0]).toEqual({ $match: { memberId: client._id } });
		expect(pipeline[1]).toEqual({ $sort: { createdAt: -1, _id: -1 } });
		expect(pipeline[2].$lookup).toMatchObject({ from: 'products', localField: 'productId' });
		expect(pipeline[3]).toEqual({ $unwind: '$product' });
		expect(pipeline[4]).toEqual({ $match: { 'product.productStatus': { $in: ['ACTIVE', 'ARCHIVED'] } } });
		const facet = pipeline.find((stage) => stage.$facet).$facet;
		expect(facet.list.slice(0, 2)).toEqual([{ $skip: 10 }, { $limit: 10 }]);
		expect(facet.metaCounter).toEqual([{ $count: 'total' }]);
		expect(products.exists).not.toHaveBeenCalled();
		expect(saved.updateOne).not.toHaveBeenCalled();
		expect(saved.deleteOne).not.toHaveBeenCalled();
	});
	it('returns the existing empty Products contract', async () => {
		expect(await service.getSavedProducts(client, { page: 1, limit: 100 })).toEqual({ list: [], metaCounter: [] });
	});
	it('normalizes string member IDs to ObjectIds in aggregation (MongoDB does not cast pipeline matches)', async () => {
		const stringClient = { ...client, _id: String(client._id) };
		await service.getSavedProducts(stringClient, { page: 1, limit: 10 });
		expect(saved.aggregate.mock.calls[0][0][0]).toEqual({ $match: { memberId: new ObjectId(stringClient._id) } });
	});
	it('resolves meSaved for the current client only, independently of any value on the parent product', async () => {
		const resolver = new SavedProductResolver(service);
		const parent = { _id: id, meSaved: false } as any;
		expect(await resolver.meSaved(parent, client)).toBe(true);
		expect(saved.exists).toHaveBeenLastCalledWith({ memberId: client._id, productId: id });
		saved.exists.mockReturnValue(query(null));
		expect(await resolver.meSaved({ ...parent, meSaved: true }, { ...client, _id: new ObjectId() })).toBe(false);
		saved.exists.mockClear();
		for (const member of [
			null,
			{ ...client, memberType: MemberType.ADMIN },
			{ ...client, memberType: MemberType.AGENT },
			{ ...client, memberStatus: MemberStatus.BLOCK },
		])
			expect(await resolver.meSaved(parent, member)).toBe(false);
		expect(saved.exists).not.toHaveBeenCalled();
	});
});

describe('Real Mongoose saved-product write behavior', () => {
	const connection = createConnection();
	const Card = connection.model('SavedProductWriteTest', SavedProductSchema);
	afterAll(async () => {
		await connection.close();
	});
	afterEach(() => {
		jest.restoreAllMocks();
	});
	it('persists one pair under repeated/parallel saves, preserves insertion time and isolates client removal', async () => {
		const records = new Map<string, any>();
		jest.spyOn(Card.collection, 'createIndex').mockResolvedValue('memberId_1_productId_1');
		jest.spyOn(Card.collection, 'updateOne').mockImplementation(async (filter: any, update: any) => {
			const key = `${filter.memberId}:${filter.productId}`;
			if (records.has(key))
				return { acknowledged: true, matchedCount: 1, modifiedCount: 0, upsertedCount: 0, upsertedId: null };
			expect(update.$set).toBeUndefined();
			records.set(key, { ...update.$setOnInsert });
			return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: id };
		});
		jest.spyOn(Card.collection, 'deleteOne').mockImplementation(async (filter: any) => ({
			acknowledged: true,
			deletedCount: Number(records.delete(`${filter.memberId}:${filter.productId}`)),
		}));
		const service = new SavedProductService(Card as any, { exists: () => query({ _id: id }) } as any);
		await service.saveProduct(client, id.toHexString());
		const first = records.get(`${client._id}:${id}`);
		await Promise.all([service.saveProduct(client, id.toHexString()), service.saveProduct(client, id.toHexString())]);
		expect(records.size).toBe(1);
		expect(records.get(`${client._id}:${id}`)).toBe(first);
		const other = { ...client, _id: new ObjectId() };
		await service.saveProduct(other, id.toHexString());
		expect(records.size).toBe(2);
		await service.unsaveProduct(client, id.toHexString());
		await service.unsaveProduct(client, id.toHexString());
		expect(records.size).toBe(1);
		expect(records.has(`${other._id}:${id}`)).toBe(true);
	});
	it('defines required ObjectId references and independent unique/pagination indexes without a stored meSaved field', async () => {
		await expect(new Card({}).validate()).rejects.toThrow();
		await expect(new Card({ memberId: client._id, productId: id }).validate()).resolves.toBeUndefined();
		expect(SavedProductSchema.get('collection')).toBe('saved_products');
		expect(SavedProductSchema.indexes()).toEqual([
			[
				{ memberId: 1, productId: 1 },
				{ unique: true, background: true },
			],
			[{ memberId: 1, createdAt: -1, _id: -1 }, { background: true }],
		]);
		expect(ProductSchema.path('meSaved')).toBeUndefined();
	});
});
