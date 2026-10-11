import 'reflect-metadata';
import { ObjectId } from 'bson';
import { model } from 'mongoose';
import { Reflector } from '@nestjs/core';
import { ProductService } from './product.service';
import { ProductResolver } from './product.resolver';
import ProductSchema from '../../libs/schemas/Product.model';
import { ProductStatus, ProductType, ProductUnit } from '../../libs/enums/product.enum';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { LikeGroup } from '../../libs/enums/like.enum';
import { ViewGroup } from '../../libs/enums/view.enum';
import { WholeSom } from '../../libs/scalars/whole-som.scalar';
import { Kind } from 'graphql';

const query = (value: unknown): any => ({ lean: () => query(value), exec: jest.fn().mockResolvedValue(value) });
const admin = { _id: new ObjectId(), memberType: MemberType.ADMIN, memberStatus: MemberStatus.ACTIVE } as any;
const input = {
	productName: '  Bolga  ',
	productType: ProductType.ASBOBLAR,
	productUnit: ProductUnit.DONA,
	productPrice: 3_000_000_000,
};
const Card = model('QuwatProductValidationTest', ProductSchema);
const card = (extra = {}): any => ({
	_id: new ObjectId(),
	...input,
	productName: 'Bolga',
	productStatus: ProductStatus.ACTIVE,
	productImages: [],
	productQuantity: 0,
	productReservedQuantity: 0,
	productMinOrderQuantity: 1,
	productQuantityStep: 1,
	archivedAt: null,
	productViews: 0,
	...extra,
});

describe('Admin product catalog', () => {
	let db: any, likes: any, views: any, service: ProductService;
	beforeEach(() => {
		db = {
			create: jest.fn(async (data) => data),
			collection: { createIndex: jest.fn().mockResolvedValue('productName_1') },
			findById: jest.fn(),
			findOne: jest.fn(),
			findOneAndUpdate: jest.fn(),
			findByIdAndUpdate: jest.fn(),
			aggregate: jest.fn().mockReturnValue(query([{ list: [], metaCounter: [] }])),
		};
		likes = {
			checkLikeExistence: jest.fn().mockResolvedValue([]),
			toggleLike: jest.fn().mockResolvedValue(1),
			getFavoriteProducts: jest.fn(),
		};
		views = { recordView: jest.fn().mockResolvedValue(null), getVisitedProducts: jest.fn() };
		service = new ProductService(db, likes, views);
	});
	it.each([MemberType.CLIENT, MemberType.AGENT])('denies %s every product management operation', async (role) => {
		const actor = { ...admin, memberType: role };
		await expect(service.createProduct(actor, input)).rejects.toThrow('Only active admins');
		await expect(service.updateProduct(actor, { _id: new ObjectId().toHexString() })).rejects.toThrow(
			'Only active admins',
		);
		await expect(service.removeProductByAdmin(actor, new ObjectId())).rejects.toThrow('Only active admins');
		await expect(service.getAllProductsByAdmin(actor, { page: 1, limit: 10, search: {} })).rejects.toThrow(
			'Only active admins',
		);
		expect(db.create).not.toHaveBeenCalled();
		expect(db.findOneAndUpdate).not.toHaveBeenCalled();
	});
	it('declares ADMIN guards on every management resolver', () => {
		const reflector = new Reflector();
		for (const method of ['createProduct', 'updateProduct', 'removeProductByAdmin', 'getAllProductsByAdmin']) {
			expect(reflector.get('roles', ProductResolver.prototype[method])).toEqual([MemberType.ADMIN]);
			expect(reflector.get('__guards__', ProductResolver.prototype[method])).toHaveLength(1);
		}
	});
	it.each(Object.values(ProductUnit))('creates %s with zero stock, unit defaults, trimmed name', async (unit) => {
		const product = await service.createProduct(admin, { ...input, productUnit: unit });
		const step = [ProductUnit.DONA, ProductUnit.QOP].includes(unit) ? 1 : 0.001;
		expect(product).toMatchObject({
			productName: 'Bolga',
			productStatus: ProductStatus.DRAFT,
			productImages: [],
			productQuantity: 0,
			productReservedQuantity: 0,
			productMinOrderQuantity: step,
			productQuantityStep: step,
		});
		await expect(new Card(product).validate()).resolves.toBeUndefined();
	});
	it.each(['memberId', 'productQuantity', 'productReservedQuantity', 'productSubtype', 'productSku'])(
		'rejects forged %s on create and update',
		async (key) => {
			await expect(service.createProduct(admin, { ...input, [key]: 100 } as any)).rejects.toThrow(
				'Invalid product input',
			);
			await expect(
				service.updateProduct(admin, { _id: new ObjectId().toHexString(), [key]: 100 } as any),
			).rejects.toThrow('Invalid product input');
		},
	);
	it.each([
		{ productName: '  a ' },
		{ productName: 'x'.repeat(101) },
		{ productType: 'HOUSE' },
		{ productPrice: -1 },
		{ productPrice: 1.5 },
		{ productPrice: Number.MAX_SAFE_INTEGER + 1 },
		{ productQuantityStep: 0 },
		{ productMinOrderQuantity: 0.1234 },
	])('rejects invalid card values %j', async (extra) => {
		await expect(service.createProduct(admin, { ...input, ...extra } as any)).rejects.toThrow();
	});
	it('requires unique names and has no owner/SKU/subtype schema fields', () => {
		for (const field of ['memberId', 'productSku', 'productSubtype']) expect(ProductSchema.path(field)).toBeUndefined();
		const nameIndex = ProductSchema.indexes().find(([keys]) => keys.productName === 1);
		expect(nameIndex?.[0]).toEqual({ productName: 1 });
		expect(nameIndex?.[1].unique).toBe(true);
		expect(Object.values(ProductSchema.paths).filter((path) => path.options.ref)).toHaveLength(0);
		expect(Object.values(ProductType)).toHaveLength(7);
	});

	it('reports a name conflict for duplicate creation after trimming', async () => {
		db.create.mockRejectedValue({ code: 11000, keyPattern: { productName: 1 } });
		await expect(service.createProduct(admin, input)).rejects.toMatchObject({
			message: 'A product with this name already exists',
			status: 409,
		});
		expect(db.create.mock.calls[0][0].productName).toBe('Bolga');
		expect(db.collection.createIndex).toHaveBeenCalledWith({ productName: 1 }, { unique: true });
	});
	it('reports a name conflict when renaming to another product name', async () => {
		const original = card();
		db.findById.mockReturnValue(query(original));
		db.findOneAndUpdate.mockReturnValue({ exec: jest.fn().mockRejectedValue({ code: 11000 }) });
		await expect(
			service.updateProduct(admin, { _id: original._id.toHexString(), productName: ' Parma ' }),
		).rejects.toMatchObject({ message: 'A product with this name already exists', status: 409 });
		expect(db.findOneAndUpdate.mock.calls[0][1].$set.productName).toBe('Parma');
	});
	it('allows keeping the same name on the same product', async () => {
		const original = card();
		db.findById.mockReturnValue(query(original));
		db.findOneAndUpdate.mockReturnValue(query(original));
		await expect(
			service.updateProduct(admin, { _id: original._id.toHexString(), productName: ' Bolga ' }),
		).resolves.toBe(original);
	});
	it('blocks writes when existing duplicates prevent the index, then retries after cleanup', async () => {
		db.collection.createIndex.mockRejectedValueOnce({ code: 11000 }).mockResolvedValue('productName_1');
		await expect(service.createProduct(admin, input)).rejects.toMatchObject({
			status: 409,
			message: expect.stringContaining('Duplicate product names already exist in the database'),
		});
		expect(db.create).not.toHaveBeenCalled();
		await expect(service.createProduct(admin, input)).resolves.toMatchObject({ productName: 'Bolga' });
		expect(db.collection.createIndex).toHaveBeenCalledTimes(2);
	});
	it('awaits index readiness before creating a card', async () => {
		let ready!: (name: string) => void;
		db.collection.createIndex.mockReturnValue(
			new Promise<string>((resolve) => {
				ready = resolve;
			}),
		);
		const pending = service.createProduct(admin, input);
		expect(db.create).not.toHaveBeenCalled();
		ready('productName_1');
		await pending;
		expect(db.create).toHaveBeenCalledTimes(1);
	});
	it('shares index readiness between concurrent creates and reports a racing duplicate', async () => {
		db.create.mockResolvedValueOnce({ productName: 'Bolga' }).mockRejectedValueOnce({ code: 11000 });
		const results = await Promise.allSettled([
			service.createProduct(admin, input),
			service.createProduct(admin, input),
		]);
		expect(results[0].status).toBe('fulfilled');
		expect(results[1]).toMatchObject({
			status: 'rejected',
			reason: { message: 'A product with this name already exists', status: 409 },
		});
		expect(db.collection.createIndex).toHaveBeenCalledTimes(1);
	});
	it('does not mask non-duplicate database write errors', async () => {
		const failure = new Error('Database unavailable');
		db.create.mockRejectedValue(failure);
		await expect(service.createProduct(admin, input)).rejects.toBe(failure);
	});
	it('does not save names if the unique index cannot be installed', async () => {
		const failure = new Error('Index permission denied');
		db.collection.createIndex.mockRejectedValue(failure);
		await expect(service.createProduct(admin, input)).rejects.toBe(failure);
		expect(db.create).not.toHaveBeenCalled();
	});
	it('allows an admin to update a card without member attribution', async () => {
		const original = card();
		db.findById.mockReturnValue(query(original));
		db.findOneAndUpdate.mockReturnValue(query({ ...original, productName: 'Parma' }));
		await service.updateProduct(admin, { _id: original._id.toHexString(), productName: ' Parma ' });
		const [filter, update] = db.findOneAndUpdate.mock.calls[0];
		expect(filter.memberId).toBeUndefined();
		expect(update.$set).toEqual({ productName: 'Parma', archivedAt: null });
		expect(update.$set.productQuantity).toBeUndefined();
	});
	it('archives without deleting and preserves the original archive timestamp on repeated calls', async () => {
		const original = card({ productStatus: ProductStatus.ARCHIVED, archivedAt: new Date('2026-10-01') });
		db.findOneAndUpdate.mockReturnValue(query(null));
		db.findById.mockReturnValue(query(original));
		expect(await service.removeProductByAdmin(admin, original._id)).toBe(original);
		expect(db.findOneAndUpdate.mock.calls[0][0]).toMatchObject({ productStatus: { $ne: ProductStatus.ARCHIVED } });
		expect(original.archivedAt).toEqual(new Date('2026-10-01'));
	});
	it('clears archivedAt on restoring an archived product', async () => {
		const original = card({ productStatus: ProductStatus.ARCHIVED, archivedAt: new Date() });
		db.findById.mockReturnValue(query(original));
		db.findOneAndUpdate.mockReturnValue(query(original));
		await service.updateProduct(admin, { _id: original._id.toHexString(), productStatus: ProductStatus.ACTIVE });
		expect(db.findOneAndUpdate.mock.calls[0][1].$set.archivedAt).toBeNull();
	});
	it.each([{ productQuantity: 1 }, { productReservedQuantity: 1 }])(
		'denies changing unit when stock or reservations exist: %j',
		async (extra) => {
			const original = card(extra);
			db.findById.mockReturnValue(query(original));
			await expect(
				service.updateProduct(admin, { _id: original._id.toHexString(), productUnit: ProductUnit.KG }),
			).rejects.toThrow('Unit cannot change');
		},
	);
	it('resets unit defaults when changing an empty-stock unit and protects against concurrent stock edits', async () => {
		const original = card();
		db.findById.mockReturnValue(query(original));
		db.findOneAndUpdate.mockReturnValue(query(null));
		await expect(
			service.updateProduct(admin, { _id: original._id.toHexString(), productUnit: ProductUnit.KG }),
		).rejects.toThrow('changed concurrently');
		const [filter, update] = db.findOneAndUpdate.mock.calls[0];
		expect(filter).toMatchObject({ productQuantity: 0, productReservedQuantity: 0 });
		expect(update.$set).toMatchObject({ productMinOrderQuantity: 0.001, productQuantityStep: 0.001 });
	});
	it('requires minimum quantities to match the unit and quantity step', async () => {
		await expect(service.createProduct(admin, { ...input, productQuantityStep: 0.5 })).rejects.toThrow(
			'Invalid minimum',
		);
		await expect(
			service.createProduct(admin, {
				...input,
				productUnit: ProductUnit.KG,
				productQuantityStep: 0.3,
				productMinOrderQuantity: 0.5,
			}),
		).rejects.toThrow('Invalid minimum');
		await expect(
			service.createProduct(admin, {
				...input,
				productUnit: ProductUnit.KG,
				productQuantityStep: 0.1,
				productMinOrderQuantity: 0.3,
			}),
		).resolves.toBeDefined();
	});
	it('only reads and likes ACTIVE cards and records product-group views/likes', async () => {
		const original = card();
		db.findOne.mockReturnValue(query(original));
		db.findByIdAndUpdate.mockReturnValue(query(original));
		views.recordView.mockResolvedValue({});
		await service.getProduct(admin._id, original._id);
		expect(db.findOne).toHaveBeenCalledWith({ _id: original._id, productStatus: ProductStatus.ACTIVE });
		expect(views.recordView).toHaveBeenCalledWith({
			memberId: admin._id,
			viewRefId: original._id,
			viewGroup: ViewGroup.PRODUCT,
		});
		expect(likes.checkLikeExistence).toHaveBeenCalledWith({
			memberId: admin._id,
			likeRefId: original._id,
			likeGroup: LikeGroup.PRODUCT,
		});
		db.findOne.mockReturnValue(query(null));
		await expect(service.likeTargetProduct(admin._id, original._id)).rejects.toThrow('Active product not found');
		expect(likes.toggleLike).not.toHaveBeenCalled();
	});
	it('filters public stock by available quantity, escapes name search, and omits owner lookups', async () => {
		await service.getProducts(null, {
			page: 1,
			limit: 10,
			search: {
				text: 'Parma.*',
				inStock: true,
				typeList: [ProductType.ASBOBLAR],
				unitList: [ProductUnit.DONA],
				brandList: ['Bosch'],
				pricesRange: { start: 0, end: 100 },
			},
		});
		const pipeline = db.aggregate.mock.calls[0][0];
		expect(pipeline[0].$match).toMatchObject({
			productStatus: ProductStatus.ACTIVE,
			productName: { $regex: 'Parma\\.\\*', $options: 'i' },
			$expr: { $gt: [{ $subtract: ['$productQuantity', '$productReservedQuantity'] }, 0] },
		});
		expect(JSON.stringify(pipeline)).not.toContain('members');
		expect(pipeline[1].$sort).toMatchObject({ createdAt: -1 });
	});
	it('permits admin status filters and rejects malformed pagination, sorts and ranges', async () => {
		await service.getAllProductsByAdmin(admin, {
			page: 1,
			limit: 100,
			search: { productStatus: ProductStatus.ARCHIVED },
		});
		expect(db.aggregate.mock.calls[0][0][0].$match.productStatus).toBe(ProductStatus.ARCHIVED);
		for (const bad of [
			{ page: 0 },
			{ limit: 101 },
			{ sort: 'memberId' },
			{ search: { productStatus: ProductStatus.ARCHIVED } },
			{ search: { pricesRange: { start: 2, end: 1 } } },
		]) {
			await expect(service.getProducts(null, { page: 1, limit: 10, search: {}, ...bad } as any)).rejects.toThrow();
		}
	});
});

describe('Whole som and schema quantity validation', () => {
	it('supports prices above GraphQL Int range and rejects unsafe/fractional/non-numeric money', () => {
		expect(WholeSom.serialize(3_000_000_000)).toBe(3_000_000_000);
		expect(WholeSom.parseValue(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
		for (const value of [-1, 1.1, NaN, Infinity, '123', Number.MAX_SAFE_INTEGER + 1])
			expect(() => WholeSom.parseValue(value)).toThrow();
		expect(WholeSom.parseLiteral({ kind: Kind.INT, value: '3000000000' }, undefined)).toBe(3_000_000_000);
		expect(() => WholeSom.parseLiteral({ kind: Kind.FLOAT, value: '1.0' }, undefined)).toThrow();
	});
	it.each([
		{ productQuantity: -1 },
		{ productQuantity: Infinity },
		{ productQuantity: 1.5 },
		{ productQuantity: 1_000_000_001 },
		{ productReservedQuantity: 1 },
	])('rejects invalid stock in schema %j', async (extra) => {
		await expect(new Card(card(extra)).validate()).rejects.toThrow();
	});
	it('accepts three-decimal metric stock and rejects finer quantities', async () => {
		const metric = card({
			productUnit: ProductUnit.METR,
			productQuantity: 1.123,
			productReservedQuantity: 0.123,
			productMinOrderQuantity: 0.001,
			productQuantityStep: 0.001,
		});
		await expect(new Card(metric).validate()).resolves.toBeUndefined();
		await expect(new Card({ ...metric, productQuantity: 1.1234 }).validate()).rejects.toThrow();
	});
});

describe('Mongoose query middleware without a database server', () => {
	it('validates a catalog update through the real query middleware and leaves stock intact', async () => {
		const current = new Card(card()).toObject();
		const read = jest.spyOn(Card.collection, 'findOne').mockResolvedValue(current as any);
		const write = jest
			.spyOn(Card.collection, 'findOneAndUpdate')
			.mockResolvedValue({ ...current, productMinOrderQuantity: 2, productQuantityStep: 2 } as any);
		try {
			const service = new ProductService(Card as any, {} as any, {} as any);
			await expect(
				service.updateProduct(admin, {
					_id: current._id.toHexString(),
					productMinOrderQuantity: 2,
					productQuantityStep: 2,
				}),
			).resolves.toMatchObject({ productMinOrderQuantity: 2, productQuantityStep: 2 });
			const persisted = write.mock.calls[0][1] as any;
			expect(persisted.$set.productQuantity).toBeUndefined();
		} finally {
			read.mockRestore();
			write.mockRestore();
		}
	});
});
