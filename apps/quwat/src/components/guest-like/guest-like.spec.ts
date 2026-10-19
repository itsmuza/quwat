import 'reflect-metadata';
import { ObjectId } from 'bson';
import { GuestLikeService, guestKeyOf } from './guest-like.service';
import { GuestLikeResolver, ProductGuestLikeResolver, MemberGuestLikeResolver } from './guest-like.resolver';
import { LikeGroup } from '../../libs/enums/like.enum';
import GuestLikeSchema from '../../libs/schemas/GuestLike.model';
const id = new ObjectId().toString();
const visitor = (n = 1): any => ({
	req: { headers: { 'x-quwat-guest-id': `12345678-1234-4123-8123-${String(n).padStart(12, '0')}` } },
});
function setup() {
	let records: any[] = [];
	const product: any = { _id: id, productStatus: 'ACTIVE', productLikes: 10 };
	const member: any = { _id: id, memberStatus: 'ACTIVE', memberType: 'AGENT', memberLikes: 5 };
	let failCounter = false;
	const matches = (row: any, filter: any) =>
		Object.entries(filter).every(([key, value]: any) =>
			typeof value === 'object' && value?.$gte !== undefined
				? row[key] >= value.$gte
				: String(row[key]) === String(value),
		);
	const query = (resolve: () => any): any => {
		const q: any = {
			session: jest.fn(() => q),
			select: jest.fn(() => q),
			lean: jest.fn(() => q),
			exec: jest.fn(async () => resolve()),
		};
		return q;
	};
	const likes: any = {
		collection: { createIndex: jest.fn(async () => 'guest_unique') },
		findOne: jest.fn((filter) => query(() => records.find((r) => matches(r, filter)))),
		find: jest.fn((filter) => query(() => records.filter((r) => matches(r, filter)))),
		create: jest.fn(async ([row]) => {
			if (records.some((r) => matches(r, row))) throw { code: 11000 };
			records.push({ ...row, _id: new ObjectId() });
		}),
		deleteOne: jest.fn((filter) =>
			query(() => {
				records = records.filter((r) => !matches(r, filter));
			}),
		),
	};
	const targetModel = (target: any) => ({
		findOne: jest.fn((filter) => query(() => (matches(target, filter) ? { ...target } : null))),
		findOneAndUpdate: jest.fn((filter, update) =>
			query(() => {
				if (failCounter) throw new Error('Counter failed');
				if (!matches(target, filter)) return null;
				for (const [key, amount] of Object.entries(update.$inc)) target[key] += Number(amount);
				return { ...target };
			}),
		),
	});
	const products = targetModel(product),
		members = targetModel(member);
	// Isolated transaction double: rollback is tested; real MongoDB races remain integration work.
	const connection: any = {
		transaction: jest.fn(async (callback) => {
			const snapshot = { records: records.map((r) => ({ ...r })), product: { ...product }, member: { ...member } };
			try {
				return await callback({ fixture: true });
			} catch (error) {
				records = snapshot.records;
				Object.assign(product, snapshot.product);
				Object.assign(member, snapshot.member);
				throw error;
			}
		}),
	};
	return {
		service: new GuestLikeService(likes, products as any, members as any, connection),
		likes,
		products,
		members,
		product,
		member,
		connection,
		records: () => records,
		failCounter: () => {
			failCounter = true;
		},
	};
}
const input = (liked = true, likeGroup = LikeGroup.PRODUCT) => ({ likeRefId: id, likeGroup, liked });
describe('Anonymous guest likes', () => {
	it('validates unpredictable guest identifiers and never interprets a member ID or bearer token as a guest', () => {
		expect(guestKeyOf(visitor())).toMatch(/^[a-f0-9]{64}$/);
		expect(guestKeyOf(visitor())).not.toBe(guestKeyOf(visitor(2)));
		for (const value of [id, '', 'test', ['12345678-1234-4123-8123-000000000001']])
			expect(guestKeyOf({ req: { headers: { 'x-quwat-guest-id': value } } })).toBeNull();
		expect(
			guestKeyOf({
				req: {
					headers: { authorization: 'Bearer invalid', 'x-quwat-guest-id': visitor().req.headers['x-quwat-guest-id'] },
				},
			}),
		).toBeNull();
		expect(GuestLikeSchema.indexes()[0][0]).toEqual({ guestKey: 1, likeGroup: 1, likeRefId: 1 });
	});
	it('sets/unsets once, preserves member counters and makes retries idempotent', async () => {
		const db = setup();
		expect((await db.service.setLike(visitor(), input())).likeCount).toBe(11);
		expect((await db.service.setLike(visitor(), input())).likeCount).toBe(11);
		expect(db.records()).toHaveLength(1);
		expect(db.member.memberLikes).toBe(5);
		expect((await db.service.setLike(visitor(), input(false))).likeCount).toBe(10);
		expect((await db.service.setLike(visitor(), input(false))).likeCount).toBe(10);
		expect(db.records()).toHaveLength(0);
	});
	it('keeps visitors and product/member groups separate even for identical target IDs', async () => {
		const db = setup();
		await db.service.setLike(visitor(), input());
		await db.service.setLike(visitor(2), input());
		await db.service.setLike(visitor(), input(true, LikeGroup.MEMBER));
		expect(db.product.productLikes).toBe(12);
		expect(db.member.memberLikes).toBe(6);
		await db.service.setLike(visitor(), input(false));
		expect(await db.service.hasLike(visitor(), LikeGroup.PRODUCT, id)).toBe(false);
		expect(await db.service.hasLike(visitor(2), LikeGroup.PRODUCT, id)).toBe(true);
		expect(await db.service.hasLike(visitor(), LikeGroup.MEMBER, id)).toBe(true);
	});
	it.each(['ARCHIVED', 'DRAFT'])('rejects %s products without changing counters', async (productStatus) => {
		const db = setup();
		db.product.productStatus = productStatus;
		await expect(db.service.setLike(visitor(), input())).rejects.toThrow('Active product not found');
		expect(db.records()).toHaveLength(0);
		expect(db.product.productLikes).toBe(10);
	});
	it.each([{ memberStatus: 'BLOCK' }, { memberStatus: 'DELETE' }, { memberType: 'ADMIN' }, { memberType: 'CLIENT' }])(
		'rejects unavailable/non-agent member %p',
		async (fields) => {
			const db = setup();
			Object.assign(db.member, fields);
			await expect(db.service.setLike(visitor(), input(true, LikeGroup.MEMBER))).rejects.toThrow(
				'Active agent not found',
			);
			expect(db.records()).toHaveLength(0);
			expect(db.member.memberLikes).toBe(5);
		},
	);
	it('rejects invalid payloads, member impersonation and authenticated guest writes before opening a transaction', async () => {
		const db = setup();
		for (const payload of [
			{ ...input(), liked: 'true' },
			{ ...input(), likeRefId: 'bad' },
			{ ...input(), likeGroup: 'ARTICLE' },
			{ ...input(), memberId: id },
		])
			await expect(db.service.setLike(visitor(), payload as any)).rejects.toThrow('Invalid guest like input');
		await expect(db.service.setLike({ req: { headers: {} } }, input())).rejects.toThrow('Invalid guest identifier');
		await expect(db.service.setLike({ req: { headers: { authorization: 'Bearer token' } } }, input())).rejects.toThrow(
			'Guest likes are for anonymous visitors',
		);
		expect(db.connection.transaction).not.toHaveBeenCalled();
	});
	it('rolls back the guest record if the counter update fails', async () => {
		const db = setup();
		db.failCounter();
		await expect(db.service.setLike(visitor(), input())).rejects.toThrow('Counter failed');
		expect(db.records()).toHaveLength(0);
		expect(db.product.productLikes).toBe(10);
	});
	it('retries a unique-pair race and reports missing transaction support clearly', async () => {
		const db = setup();
		db.likes.create.mockRejectedValueOnce({ code: 11000 });
		expect((await db.service.setLike(visitor(), input())).likeCount).toBe(11);
		db.connection.transaction.mockRejectedValueOnce({ code: 20 });
		await expect(db.service.setLike(visitor(), input(false))).rejects.toThrow(
			'Guest likes require MongoDB transaction support',
		);
		expect(db.records()).toHaveLength(1);
	});
	it('batches guest state once per request, clears its cache after mutation and returns false for member sessions', async () => {
		const db = setup(),
			context = visitor();
		expect(await db.service.hasLike(context, LikeGroup.PRODUCT, id)).toBe(false);
		await db.service.setLike(context, input());
		expect(await db.service.hasLike(context, LikeGroup.PRODUCT, id)).toBe(true);
		await db.service.hasLike(context, LikeGroup.MEMBER, id);
		expect(db.likes.find).toHaveBeenCalledTimes(2);
		expect(
			await db.service.hasLike({ req: { headers: { authorization: 'Bearer member' } } }, LikeGroup.PRODUCT, id),
		).toBe(false);
	});
	it('public field resolvers restrict guest state to active products and active agents', async () => {
		const service = { hasLike: jest.fn(async () => true), setLike: jest.fn(async () => 'result') };
		const p = new ProductGuestLikeResolver(service as any),
			m = new MemberGuestLikeResolver(service as any);
		expect(await p.guestLiked({ _id: id, productStatus: 'ACTIVE' } as any, visitor())).toBe(true);
		expect(await p.guestLiked({ _id: id, productStatus: 'DRAFT' } as any, visitor())).toBe(false);
		expect(await m.guestLiked({ _id: id, memberType: 'CLIENT', memberStatus: 'ACTIVE' } as any, visitor())).toBe(false);
		expect(await m.guestLiked({ _id: id, memberType: 'AGENT', memberStatus: 'ACTIVE' } as any, visitor())).toBe(true);
		expect(await new GuestLikeResolver(service as any).setGuestLike(input(), visitor())).toBe('result');
	});
});
