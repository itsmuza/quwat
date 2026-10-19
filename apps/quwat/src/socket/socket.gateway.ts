import { randomUUID } from 'crypto';
import { Logger } from '@nestjs/common';
import { OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'ws';
import * as WebSocket from 'ws';
import { AuthService } from '../components/auth/auth.service';
import { Member } from '../libs/dto/member/member';
import * as url from 'url';
import { MemberType } from '../libs/enums/member.enum';

interface ChatMember {
	_id: string;
	memberNick: string;
	memberImage?: string;
}
interface MessagePayload {
	id: string;
	senderId: string;
	createdAt: string;
	event: string;
	text: string;
	memberData: ChatMember | null;
}

interface InfoPayload {
	event: string;
	totalClients: number;
	memberData: ChatMember | null;
	action: string;
}

@WebSocketGateway({ transports: ['websocket'], secure: false })
export class SocketGateway implements OnGatewayInit {
	private logger: Logger = new Logger('SocketEventsGateway');
	private summaryClient: number = 0;
	private clientsAuthMap = new Map<WebSocket, Member | null>();
	private messagesList: MessagePayload[] = [];
	private clientIds = new Map<WebSocket, string>();
	private chatTokens = new Map<WebSocket, string>();
	private agentTokens = new Map<WebSocket, string>();

	constructor(private authService: AuthService) {}

	@WebSocketServer()
	server!: Server;

	afterInit(_server: Server) {
		this.logger.verbose(`WebSocket Server Initialized total: [${this.summaryClient}]`);
	}

	private publicMember(member: Member | null | undefined): ChatMember | null {
		return member
			? {
					_id: String(member._id),
					memberNick: member.memberNick,
					...(member.memberImage ? { memberImage: member.memberImage } : {}),
				}
			: null;
	}
	private chatError(client: WebSocket, code: string) {
		if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ event: 'chatError', code }));
	}

	private async retrieveAuth(req: any): Promise<Member | null> {
		try {
			const parseUrl = url.parse(req.url, true);
			const { token } = parseUrl.query;
			return await this.authService.verifyToken(token as string);
		} catch (err) {
			return null;
		}
	}

	async handleConnection(client: WebSocket, req: any) {
		const authMember: Member | null = await this.retrieveAuth(req);
		if (client.readyState !== WebSocket.OPEN) return;
		const clientId = randomUUID();
		this.clientIds.set(client, clientId);
		this.summaryClient = this.clientsAuthMap.size + 1;
		this.clientsAuthMap.set(client, authMember);
		const token = url.parse(req.url, true).query.token;
		if (typeof token === 'string') this.chatTokens.set(client, token);
		if (authMember?.memberType === MemberType.AGENT && typeof token === 'string') this.agentTokens.set(client, token);

		const clientNick: string = authMember?.memberNick ?? 'Guest';
		this.logger.log(`== Connection [${clientNick}] and total: [${this.summaryClient}] ==`);

		const infoMsg: InfoPayload = {
			event: 'info',
			totalClients: this.summaryClient,
			memberData: this.publicMember(authMember),
			action: 'joined',
		};

		client.send(JSON.stringify({ event: 'connected', clientId }));
		this.emitMessage(infoMsg);
		client.send(JSON.stringify({ event: 'getMessages', list: this.messagesList }));
	}

	handleDisconnect(client: WebSocket) {
		const authMember = this.clientsAuthMap.get(client);
		if (!this.clientsAuthMap.has(client)) return;
		this.clientsAuthMap.delete(client);
		this.summaryClient = this.clientsAuthMap.size;
		this.clientIds.delete(client);
		this.chatTokens.delete(client);
		this.agentTokens.delete(client);

		const clientNick: string = authMember?.memberNick ?? 'Guest';
		this.logger.verbose(`== Disconnection [${clientNick}] and total: [${this.summaryClient}] ==`);

		const infoMsg: InfoPayload = {
			event: 'info',
			totalClients: this.summaryClient,
			memberData: this.publicMember(authMember),
			action: 'left',
		};

		this.broadcastMessage(client, infoMsg);
	}

	@SubscribeMessage('message')
	public async handleMessage(client: WebSocket, payload: unknown): Promise<void> {
		if (!this.clientsAuthMap.has(client) || client.readyState !== WebSocket.OPEN) return;
		if (typeof payload !== 'string' || !payload.trim() || payload.length > 1000) {
			this.chatError(client, 'CHAT_INVALID_MESSAGE');
			return;
		}
		let authMember = this.clientsAuthMap.get(client);
		const token = this.chatTokens.get(client);
		if (token) {
			try {
				authMember = await this.authService.verifyToken(token);
				if (!this.clientsAuthMap.has(client) || client.readyState !== WebSocket.OPEN) return;
				this.clientsAuthMap.set(client, authMember);
			} catch {
				this.chatError(client, 'CHAT_AUTH_REQUIRED');
				return;
			}
		}
		if (!this.clientsAuthMap.has(client) || client.readyState !== WebSocket.OPEN) return;
		const newMessage: MessagePayload = {
			event: 'message',
			id: randomUUID(),
			senderId: this.clientIds.get(client)!,
			createdAt: new Date().toISOString(),
			text: payload.trim(),
			memberData: this.publicMember(authMember),
		};
		this.messagesList.push(newMessage);
		if (this.messagesList.length > 50) this.messagesList.splice(0, this.messagesList.length - 50);
		this.emitMessage(newMessage);
	}

	async notifySaleChanged(): Promise<void> {
		await Promise.allSettled(
			[...this.agentTokens].map(async ([client, token]) => {
				try {
					// Re-check expiry, current role and ACTIVE status before each hint.
					const member = await this.authService.verifyToken(token);
					if (member.memberType !== MemberType.AGENT) {
						this.agentTokens.delete(client);
						return;
					}
					if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ event: 'saleChanged' }));
				} catch {
					this.agentTokens.delete(client);
				}
			}),
		);
	}

	private broadcastMessage(sender: WebSocket, message: InfoPayload | MessagePayload) {
		this.server.clients.forEach((client) => {
			if (client !== sender && client.readyState === WebSocket.OPEN) {
				client.send(JSON.stringify(message));
			}
		});
	}

	private emitMessage(message: InfoPayload | MessagePayload) {
		this.server.clients.forEach((client) => {
			if (client.readyState === WebSocket.OPEN) {
				client.send(JSON.stringify(message));
			}
		});
	}
}
