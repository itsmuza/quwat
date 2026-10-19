import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { WsAdapter } from '@nestjs/platform-ws';
import { INestApplication } from '@nestjs/common';
import { AddressInfo } from 'net';
import WebSocket from 'ws';
import { SocketGateway } from './socket.gateway';
import { AuthService } from '../components/auth/auth.service';
const waitFor = async (predicate: () => boolean) => {
	const start = Date.now();
	while (!predicate()) {
		if (Date.now() - start > 2500) throw new Error('Socket fixture timed out');
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
};
describe('Isolated Nest raw WebSocket transport', () => {
	let app: INestApplication, url: string;
	const clients: WebSocket[] = [];
	beforeAll(async () => {
		const module = await Test.createTestingModule({
			providers: [
				SocketGateway,
				{
					provide: AuthService,
					useValue: {
						verifyToken: async () => {
							throw new Error('Guest fixture');
						},
					},
				},
			],
		}).compile();
		app = module.createNestApplication({ logger: false });
		app.useWebSocketAdapter(new WsAdapter(app));
		await app.listen(0, '127.0.0.1');
		url = `ws://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
	});
	afterAll(async () => {
		for (const client of clients) client.terminate();
		await app?.close();
	});
	const connect = async () => {
		const client = new WebSocket(url),
			events: any[] = [];
		clients.push(client);
		client.on('message', (raw) => events.push(JSON.parse(String(raw))));
		await waitFor(() => events.some((e) => e.event === 'getMessages'));
		return { client, events };
	};
	it('delivers raw string-envelope messages between guests, restores history and rejects object payloads', async () => {
		const a = await connect(),
			b = await connect();
		a.client.send(JSON.stringify({ event: 'message', data: 'Isolated chat check' }));
		await waitFor(() => a.events.some((e) => e.event === 'message') && b.events.some((e) => e.event === 'message'));
		const sent = a.events.find((e) => e.event === 'message');
		expect(sent.text).toBe('Isolated chat check');
		expect(sent.senderId).toBe(a.events.find((e) => e.event === 'connected').clientId);
		expect(b.events.find((e) => e.event === 'message')).toEqual(sent);
		const c = await connect();
		expect(c.events.find((e) => e.event === 'getMessages').list).toEqual([sent]);
		a.client.send(JSON.stringify({ event: 'message', data: { text: 'forged', memberData: { _id: 'fake' } } }));
		await waitFor(() => a.events.some((e) => e.event === 'chatError'));
		expect(b.events.filter((e) => e.event === 'message')).toHaveLength(1);
		b.client.close();
		await waitFor(() => a.events.some((e) => e.event === 'info' && e.action === 'left' && e.totalClients === 2));
	});
});
