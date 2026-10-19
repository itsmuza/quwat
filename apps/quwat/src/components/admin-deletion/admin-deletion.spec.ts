import 'reflect-metadata';
import { ObjectId } from 'bson';
import { AdminDeletionService } from './admin-deletion.service';
import { MemberType, MemberStatus } from '../../libs/enums/member.enum';
const id = new ObjectId().toHexString(),
	other = new ObjectId().toHexString(),
	adminId = new ObjectId().toHexString();
const admin: any = { _id: adminId, memberType: MemberType.ADMIN, memberStatus: MemberStatus.ACTIVE };
const clone = (x: any) => JSON.parse(JSON.stringify(x));
function matches(row: any, filter: any): boolean {
	return Object.entries(filter).every(([key, value]: [string, any]) => {
		if (key === '$or') return value.some((x: any) => matches(row, x));
		if (key === 'items.productId') return row.items?.some((i: any) => String(i.productId) === String(value));
		if (value && value.$ne !== undefined) return String(row[key]) !== String(value.$ne);
		return String(row[key]) === String(value);
	});
}
function setup() {
	const names = ['products', 'members', 'likes', 'views', 'comments', 'guestLikes', 'saved', 'sales', 'reads'];
	let state: Record<string, any[]> = Object.fromEntries(names.map((n) => [n, []]));
	let active: any,
		fail = '';
	const query = (work: () => any, initial?: any): any => {
		let selected = initial;
		const q = {
			session(s: any) {
				selected = s;
				return q;
			},
			lean() {
				return q;
			},
			async exec() {
				expect(selected).toBe(active);
				return clone(work());
			},
		};
		return q;
	};
	const models = names.map((name) => ({
		findById: (key: any) => query(() => state[name].find((r) => r._id === String(key)) || null),
		find: (f: any) => query(() => state[name].filter((r) => matches(r, f))),
		exists: (f: any) => query(() => state[name].find((r) => matches(r, f)) || null),
		deleteOne: (f: any, opts: any) =>
			query(() => {
				const i = state[name].findIndex((r) => matches(r, f));
				if (i < 0) return { deletedCount: 0 };
				state[name].splice(i, 1);
				return { deletedCount: 1 };
			}, opts.session),
		deleteMany: (f: any, opts: any) =>
			query(() => {
				if (fail === name) throw new Error('cleanup failed');
				const count = state[name].length;
				state[name] = state[name].filter((r) => !matches(r, f));
				return { deletedCount: count - state[name].length };
			}, opts.session),
		updateOne: (f: any, update: any, opts: any) =>
			query(() => {
				const row = state[name].find((r) => matches(r, f));
				if (row) {
					const field = Object.keys(update[0].$set)[0];
					row[field] = Math.max(0, (row[field] || 0) - 1);
				}
				return { matchedCount: row ? 1 : 0 };
			}, opts.session),
	}));
	const connection: any = {
		transaction: jest.fn(async (work: any) => {
			const before = clone(state);
			active = {};
			try {
				return await work(active);
			} catch (e) {
				state = before;
				throw e;
			} finally {
				active = undefined;
			}
		}),
	};
	const service = new AdminDeletionService(...(models as [any, any, any, any, any, any, any, any, any]), connection);
	return {
		service,
		connection,
		get state() {
			return state;
		},
		set fail(value: string) {
			fail = value;
		},
	};
}
describe('Admin permanent deletion with isolated transactional storage', () => {
	it.each([
		null,
		{ ...admin, memberType: 'CLIENT' },
		{ ...admin, memberType: 'AGENT' },
		{ ...admin, memberStatus: 'BLOCK' },
	])('denies actor %p before writes', async (actor) => {
		const db = setup();
		await expect(db.service.deleteProduct(actor as any, id)).rejects.toThrow('Only active admins');
		await expect(db.service.deleteMember(actor as any, id)).rejects.toThrow('Only active admins');
		expect(db.connection.transaction).not.toHaveBeenCalled();
	});
	it('validates IDs and protects self and other administrators', async () => {
		const db = setup();
		await expect(db.service.deleteProduct(admin, 'bad')).rejects.toThrow('Invalid deletion target');
		await expect(db.service.deleteMember(admin, adminId)).rejects.toThrow('delete themselves');
		db.state.members.push({ _id: id, memberType: 'ADMIN' });
		await expect(db.service.deleteMember(admin, id)).rejects.toThrow('Administrator accounts');
		expect(db.state.members).toHaveLength(1);
	});
	it.each([0, 2])('blocks pending sales/reservations (%p) and retains the product', async (reserved) => {
		const db = setup();
		db.state.products.push({ _id: id, productReservedQuantity: reserved });
		if (!reserved) db.state.sales.push({ _id: other, saleStatus: 'PENDING', items: [{ productId: id }] });
		await expect(db.service.deleteProduct(admin, id)).rejects.toThrow('pending sales or reserved');
		expect(db.state.products).toHaveLength(1);
	});
	it('hard deletes the product and target social/saved rows while preserving sale snapshots and unrelated rows', async () => {
		const db = setup();
		db.state.products.push({ _id: id, productReservedQuantity: 0 }, { _id: other, productReservedQuantity: 0 });
		for (const [table, prefix] of [
			['likes', 'like'],
			['views', 'view'],
			['comments', 'comment'],
			['guestLikes', 'like'],
		])
			db.state[table].push(
				{ _id: id, [prefix + 'RefId']: id, [prefix + 'Group']: 'PRODUCT' },
				{ _id: other, [prefix + 'RefId']: id, [prefix + 'Group']: 'MEMBER' },
			);
		db.state.saved.push({ productId: id }, { productId: other });
		db.state.sales.push({ saleStatus: 'COMPLETED', items: [{ productId: id, productName: 'Snapshot' }] });
		const history = clone(db.state.sales);
		expect(await db.service.deleteProduct(admin, id)).toBe(true);
		expect(db.state.products.map((p) => p._id)).toEqual([other]);
		for (const table of ['likes', 'views', 'comments', 'guestLikes', 'saved']) expect(db.state[table]).toHaveLength(1);
		expect(db.state.sales).toEqual(history);
		expect(await db.service.deleteProduct(admin, id)).toBe(true);
	});
	it.each(['CLIENT', 'AGENT'])(
		'deletes %s account, reconciles outgoing counters, keeps receipts and retries safely',
		async (role) => {
			const db = setup();
			db.state.members.push({ _id: id, memberType: role }, { _id: other, memberType: 'AGENT', memberLikes: 0 });
			db.state.products.push({ _id: other, productLikes: 2, productViews: 1, productComments: 1 });
			db.state.likes.push(
				{ memberId: id, likeRefId: other, likeGroup: 'PRODUCT' },
				{ memberId: id, likeRefId: other, likeGroup: 'MEMBER' },
				{ memberId: other, likeRefId: id, likeGroup: 'MEMBER' },
			);
			db.state.views.push({ memberId: id, viewRefId: other, viewGroup: 'PRODUCT' });
			db.state.comments.push(
				{ memberId: id, commentRefId: other, commentGroup: 'PRODUCT', commentStatus: 'ACTIVE' },
				{ memberId: id, commentRefId: other, commentGroup: 'PRODUCT', commentStatus: 'DELETE' },
			);
			db.state.saved.push({ memberId: id });
			db.state.reads.push({ agentId: id });
			db.state.sales.push({ clientId: id, clientName: 'Old name', saleStatus: 'PENDING' });
			const history = clone(db.state.sales);
			expect(await db.service.deleteMember(admin, id)).toBe(true);
			expect(db.state.members.map((m) => m._id)).toEqual([other]);
			expect(db.state.products[0]).toMatchObject({ productLikes: 1, productViews: 0, productComments: 0 });
			expect(db.state.members[0].memberLikes).toBe(0);
			for (const table of ['likes', 'views', 'comments', 'saved', 'reads']) expect(db.state[table]).toHaveLength(0);
			expect(db.state.sales).toEqual(history);
			expect(await db.service.deleteMember(admin, id)).toBe(true);
		},
	);
	it('rolls back master deletion and all social counters on cleanup failure', async () => {
		const db = setup();
		db.state.members.push({ _id: id, memberType: 'CLIENT' });
		db.state.products.push({ _id: other, productLikes: 1 });
		db.state.likes.push({ memberId: id, likeRefId: other, likeGroup: 'PRODUCT' });
		db.fail = 'comments';
		const before = clone(db.state);
		await expect(db.service.deleteMember(admin, id)).rejects.toThrow('cleanup failed');
		expect(db.state).toEqual(before);
	});
	it('reports unsupported transactions without partial writes', async () => {
		const db = setup();
		db.connection.transaction.mockRejectedValueOnce(Object.assign(new Error('unsupported'), { code: 20 }));
		await expect(db.service.deleteProduct(admin, id)).rejects.toThrow('replica set');
	});
});
