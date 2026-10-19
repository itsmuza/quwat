import 'reflect-metadata';
import { SocketGateway } from './socket.gateway';
import { MemberType } from '../libs/enums/member.enum';
const member: any = {
	_id: '507f1f77bcf86cd799439011',
	memberNick: 'agent',
	memberImage: 'uploads/member/avatar.png',
	memberType: MemberType.AGENT,
	memberPhone: 'private-phone',
	memberAddress: 'private-address',
	memberPassword: 'private-hash',
	accessToken: 'private-token',
};
function setup() {
	const auth = {
		verifyToken: jest.fn(async (token: string) => {
			if (token !== 'valid') throw new Error('Expired');
			return member;
		}),
	};
	const gateway = new SocketGateway(auth as any);
	const clients = new Set<any>();
	gateway.server = { clients } as any;
	(gateway as any).logger = { log() {}, verbose() {} };
	const client = () => {
		const c = { readyState: 1, send: jest.fn() };
		clients.add(c);
		return c;
	};
	const received = (c: ReturnType<typeof client>) => c.send.mock.calls.map(([raw]) => JSON.parse(raw));
	return { gateway, auth, client, received, clients };
}
describe('Raw WebSocket public chat', () => {
	it('provides a connection ID, shared presence and a safe member projection in events/history', async () => {
		const db = setup(),
			guest = db.client(),
			agent = db.client();
		await db.gateway.handleConnection(guest as any, { url: '/' });
		await db.gateway.handleConnection(agent as any, { url: '/?token=valid' });
		expect(db.received(guest).find((e) => e.event === 'connected').clientId).toMatch(/^[a-f0-9-]{36}$/);
		const info = db
			.received(guest)
			.filter((e) => e.event === 'info')
			.pop();
		expect(info.totalClients).toBe(2);
		expect(info.memberData).toEqual({ _id: member._id, memberNick: 'agent', memberImage: member.memberImage });
		await db.gateway.handleMessage(agent as any, '  Salom  ');
		const message = db
			.received(guest)
			.filter((e) => e.event === 'message')
			.pop();
		expect(message.text).toBe('Salom');
		expect(message.id).toBeDefined();
		expect(Date.parse(message.createdAt)).not.toBeNaN();
		expect(JSON.stringify(db.received(guest))).not.toMatch(/private-phone|private-address|private-hash|private-token/);
		const later = db.client();
		await db.gateway.handleConnection(later as any, { url: '/' });
		expect(db.received(later).find((e) => e.event === 'getMessages').list).toEqual([message]);
	});
	it.each([null, {}, ['message'], 17, '', '   ', 'x'.repeat(1001)])(
		'rejects invalid payload %p without storing or broadcasting it',
		async (payload) => {
			const db = setup(),
				sender = db.client(),
				reader = db.client();
			await db.gateway.handleConnection(sender as any, { url: '/' });
			await db.gateway.handleConnection(reader as any, { url: '/' });
			const before = reader.send.mock.calls.length;
			await db.gateway.handleMessage(sender as any, payload);
			expect(db.received(sender).pop()).toEqual({ event: 'chatError', code: 'CHAT_INVALID_MESSAGE' });
			expect(reader.send).toHaveBeenCalledTimes(before);
			expect((db.gateway as any).messagesList).toHaveLength(0);
		},
	);
	it('keeps at most 50 ordered messages and makes anonymous messages identifiable only by connection', async () => {
		const db = setup(),
			sender = db.client();
		await db.gateway.handleConnection(sender as any, { url: '/' });
		const senderId = db.received(sender).find((e) => e.event === 'connected').clientId;
		for (let n = 1; n <= 51; n++) await db.gateway.handleMessage(sender as any, `message ${n}`);
		const list = (db.gateway as any).messagesList;
		expect(list).toHaveLength(50);
		expect(list[0].text).toBe('message 2');
		expect(list[49].text).toBe('message 51');
		expect(list.every((e) => e.senderId === senderId && e.memberData === null)).toBe(true);
	});
	it('revalidates authenticated senders and refuses expired/blocked sessions without broadcasting', async () => {
		const db = setup(),
			sender = db.client();
		await db.gateway.handleConnection(sender as any, { url: '/?token=valid' });
		db.auth.verifyToken.mockRejectedValueOnce(new Error('Blocked'));
		await db.gateway.handleMessage(sender as any, 'Denied');
		expect(db.received(sender).pop()).toEqual({ event: 'chatError', code: 'CHAT_AUTH_REQUIRED' });
		expect((db.gateway as any).messagesList).toHaveLength(0);
	});
	it('disconnects once, prevents negative presence and ignores closed/unregistered senders', async () => {
		const db = setup(),
			sender = db.client();
		await db.gateway.handleConnection(sender as any, { url: '/' });
		db.gateway.handleDisconnect(sender as any);
		db.gateway.handleDisconnect(sender as any);
		expect((db.gateway as any).summaryClient).toBe(0);
		await db.gateway.handleMessage(sender as any, 'stale');
		expect((db.gateway as any).messagesList).toHaveLength(0);
		expect((db.gateway as any).chatTokens.size).toBe(0);
	});
	it('does not restore a disconnected sender after pending per-message authentication', async () => {
		const db = setup(),
			sender = db.client();
		await db.gateway.handleConnection(sender as any, { url: '/?token=valid' });
		let finish: (value: any) => void;
		db.auth.verifyToken.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		const pending = db.gateway.handleMessage(sender as any, 'stale');
		sender.readyState = 3;
		db.gateway.handleDisconnect(sender as any);
		finish!(member);
		await pending;
		expect((db.gateway as any).clientsAuthMap.size).toBe(0);
		expect((db.gateway as any).messagesList).toHaveLength(0);
		expect((db.gateway as any).summaryClient).toBe(0);
	});
	it('does not register a connection that closes while its authentication is pending', async () => {
		const db = setup(),
			sender = db.client();
		let finish: (value: any) => void;
		db.auth.verifyToken.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		const pending = db.gateway.handleConnection(sender as any, { url: '/?token=valid' });
		sender.readyState = 3;
		finish!(member);
		await pending;
		expect((db.gateway as any).summaryClient).toBe(0);
		expect(sender.send).not.toHaveBeenCalled();
	});
});
