import 'reflect-metadata';
import { ObjectId } from 'bson';
import { SaleInboxService } from './sale-inbox.service';
import { SocketGateway } from '../../socket/socket.gateway';
import { MemberType, MemberStatus } from '../../libs/enums/member.enum';
const agent = {
	_id: new ObjectId().toHexString(),
	memberType: MemberType.AGENT,
	memberStatus: MemberStatus.ACTIVE,
} as any;
const saleId = new ObjectId().toHexString();
const exec = (value: any) => ({ exec: jest.fn().mockResolvedValue(value) });

describe('Persisted agent sale inbox (isolated models)', () => {
	let sales: any, reads: any, inbox: SaleInboxService;
	beforeEach(() => {
		sales = {
			aggregate: jest.fn(() =>
				exec([
					{
						list: [{ sale: { _id: saleId }, readAt: null }],
						metaCounter: [{ total: 23 }],
						unreadCounter: [{ total: 21 }],
					},
				]),
			),
			exists: jest.fn(() => exec({ _id: saleId })),
			findOne: jest.fn(() => ({ lean: () => exec({ _id: saleId, saleStatus: 'CANCELLED' }) })),
		};
		reads = {
			collection: { name: 'sale_notification_reads', createIndex: jest.fn().mockResolvedValue('unique_pair') },
			updateOne: jest.fn(() => exec({ upsertedCount: 1 })),
			exists: jest.fn(() => exec({ _id: 'read' })),
		};
		inbox = new SaleInboxService(sales, reads);
	});
	it('filters pending requests before pagination/unread counts and scopes reads to the current agent', async () => {
		const result = await inbox.getSaleNotifications(agent, { page: 2, limit: 10 });
		expect(result).toMatchObject({ unreadCount: 21, metaCounter: [{ total: 23 }] });
		const pipeline = sales.aggregate.mock.calls[0][0];
		expect(pipeline[0]).toEqual({ $match: { saleStatus: 'PENDING' } });
		expect(pipeline[1]).toEqual({ $sort: { createdAt: -1, _id: -1 } });
		expect(pipeline[2].$lookup.pipeline[0].$match.$expr.$and[1].$eq[1].toString()).toBe(agent._id);
		expect(pipeline[4].$facet.list.slice(0, 2)).toEqual([{ $skip: 10 }, { $limit: 10 }]);
		expect(pipeline[4].$facet.unreadCounter).toEqual([{ $match: { readAt: null } }, { $count: 'total' }]);
		expect(sales.updateOne).toBeUndefined();
	});
	it('marks only this agent/sale pair, preserves first-read time and awaits the unique index', async () => {
		await inbox.markSaleNotificationRead(agent, { _id: saleId });
		await inbox.markSaleNotificationRead(agent, { _id: saleId });
		expect(reads.collection.createIndex).toHaveBeenCalledTimes(1);
		const [filter, update, options] = reads.updateOne.mock.calls[0];
		expect(filter.agentId.toString()).toBe(agent._id);
		expect(filter.saleId.toString()).toBe(saleId);
		expect(update.$set).toBeUndefined();
		expect(update.$setOnInsert.readAt).toBeInstanceOf(Date);
		expect(options.upsert).toBe(true);
		const other = { ...agent, _id: new ObjectId().toHexString() };
		await inbox.markSaleNotificationRead(other, { _id: saleId });
		expect(reads.updateOne.mock.calls[2][0].agentId.toString()).toBe(other._id);
	});
	it('recovers duplicate upsert races only for the exact read pair; retries failed index setup', async () => {
		reads.collection.createIndex.mockRejectedValueOnce(new Error('index temporarily unavailable'));
		await expect(inbox.markSaleNotificationRead(agent, { _id: saleId })).rejects.toThrow('index');
		reads.updateOne.mockReturnValueOnce({ exec: () => Promise.reject({ code: 11000 }) });
		await expect(inbox.markSaleNotificationRead(agent, { _id: saleId })).resolves.toBe(true);
		expect(reads.collection.createIndex).toHaveBeenCalledTimes(2);
		reads.updateOne.mockReturnValueOnce({ exec: () => Promise.reject({ code: 11000 }) });
		reads.exists.mockReturnValueOnce(exec(null));
		await expect(inbox.markSaleNotificationRead(agent, { _id: saleId })).rejects.toMatchObject({ code: 11000 });
	});
	it('keeps final requests accessible by exact sale ID and rejects missing/invalid IDs', async () => {
		expect(await inbox.getSaleForAgent(agent, { _id: saleId })).toMatchObject({ saleStatus: 'CANCELLED' });
		sales.exists.mockReturnValue(exec(null));
		await expect(inbox.markSaleNotificationRead(agent, { _id: saleId })).rejects.toThrow('not found');
		expect(reads.updateOne).not.toHaveBeenCalled();
		await expect(inbox.getSaleForAgent(agent, { _id: 'bad' })).rejects.toThrow('Invalid sale input');
	});
	it.each([MemberType.CLIENT, MemberType.ADMIN, 'guest', 'blocked'])(
		'denies %s and caller-supplied identities before storage',
		async (state) => {
			const member =
				state === 'guest'
					? null
					: {
							...agent,
							memberType: state === 'blocked' ? MemberType.AGENT : state,
							memberStatus: state === 'blocked' ? MemberStatus.BLOCK : MemberStatus.ACTIVE,
						};
			await expect(inbox.getSaleNotifications(member as any, { page: 1, limit: 10 })).rejects.toThrow();
			await expect(inbox.markSaleNotificationRead(member as any, { _id: saleId })).rejects.toThrow();
			await expect(inbox.getSaleForAgent(member as any, { _id: saleId })).rejects.toThrow();
			expect(sales.aggregate).not.toHaveBeenCalled();
			expect(reads.updateOne).not.toHaveBeenCalled();
		},
	);
	it('validates pagination and rejects agent identity injection', async () => {
		for (const input of [
			{ page: 0, limit: 10 },
			{ page: 1, limit: 101 },
			{ page: 1, limit: 10, agentId: agent._id },
		])
			await expect(inbox.getSaleNotifications(agent, input)).rejects.toThrow('Invalid sale input');
		await expect(inbox.markSaleNotificationRead(agent, { _id: saleId, agentId: agent._id } as any)).rejects.toThrow(
			'Invalid sale input',
		);
		expect(sales.aggregate).not.toHaveBeenCalled();
	});
});

describe('Agent socket sale hints', () => {
	it('sends no customer/payment data, verifies live roles and skips expired, blocked and non-agent sockets', async () => {
		const tokens: Record<string, any> = { active: agent, client: { ...agent, memberType: MemberType.CLIENT } };
		const auth = {
			verifyToken: jest.fn(async (token) => {
				if (!tokens[token]) throw new Error('Expired');
				return tokens[token];
			}),
		};
		const gateway = new SocketGateway(auth as any);
		const sockets = ['active', 'client', 'blocked'].map(() => ({ readyState: 1, send: jest.fn() }));
		(gateway as any).agentTokens = new Map(sockets.map((socket, i) => [socket, ['active', 'client', 'blocked'][i]]));
		await gateway.notifySaleChanged();
		expect(sockets[0].send).toHaveBeenCalledWith(JSON.stringify({ event: 'saleChanged' }));
		expect(sockets[1].send).not.toHaveBeenCalled();
		expect(sockets[2].send).not.toHaveBeenCalled();
		expect((gateway as any).agentTokens.size).toBe(1);
	});
});
