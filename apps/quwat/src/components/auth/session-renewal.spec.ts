import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { GraphQLModule, GraphQLSchemaHost, Query, Resolver } from '@nestjs/graphql';
import { ApolloDriver } from '@nestjs/apollo';
import { JwtService } from '@nestjs/jwt';
import { graphql } from 'graphql';
import { ObjectId } from 'bson';
import { AuthResolver } from './auth.resolver';
import { AuthService } from './auth.service';
import { MemberType, MemberStatus } from '../../libs/enums/member.enum';

@Resolver()
class ProbeResolver {
	@Query(() => Boolean)
	sessionProbe() {
		return true;
	}
}
const id = new ObjectId();
const seconds = 30 * 24 * 60 * 60;
const now = Math.floor(Date.now() / 1000);
const jwt = new JwtService({ secret: 'quwat-session-isolated-test-only', signOptions: { expiresIn: '30d' } });
const mutation = 'mutation { refreshSession { _id memberType memberStatus memberNick accessToken guestLiked } }';

describe('Rolling session renewal through real GraphQL/auth guard (no database)', () => {
	let app: INestApplication;
	let auth: AuthService;
	let member: any;
	const model = {
		findOne: jest.fn((filter: any) => ({
			lean: () => ({
				exec: async () =>
					member && String(member._id) === String(filter._id) && member.memberStatus === filter.memberStatus
						? { ...member }
						: null,
			}),
		})),
	};
	beforeAll(async () => {
		const module = await Test.createTestingModule({
			imports: [GraphQLModule.forRoot({ driver: ApolloDriver, autoSchemaFile: true })],
			providers: [
				AuthResolver,
				ProbeResolver,
				AuthService,
				{ provide: JwtService, useValue: jwt },
				{ provide: getModelToken('Member'), useValue: model },
			],
		}).compile();
		app = module.createNestApplication({ logger: false });
		await app.init();
		auth = app.get(AuthService);
	});
	afterAll(async () => {
		await app?.close();
	});
	beforeEach(() => {
		member = {
			_id: id,
			memberType: MemberType.CLIENT,
			memberStatus: MemberStatus.ACTIVE,
			memberNick: 'session-test',
			memberPassword: 'must-not-leak',
		};
		jest.spyOn(Date, 'now').mockReturnValue(now * 1000);
		jest.spyOn(console, 'info').mockImplementation(() => undefined);
		jest.spyOn(console, 'log').mockImplementation(() => undefined);
		jest.spyOn(auth, 'createToken');
		model.findOne.mockClear();
	});
	afterEach(() => jest.restoreAllMocks());
	async function run(token?: string, source = mutation) {
		return graphql({
			schema: app.get(GraphQLSchemaHost).schema,
			source,
			contextValue: { req: { headers: token ? { authorization: `Bearer ${token}` } : {}, body: {} } },
		});
	}
	it.each([MemberType.CLIENT, MemberType.AGENT, MemberType.ADMIN])(
		'renews %s from now, using the current database role and identity only',
		async (role) => {
			member.memberType = role;
			const original = await jwt.signAsync({ _id: id.toHexString(), iat: now - 20 * 86400, memberType: 'forged-role' });
			const before = jwt.decode(original) as any;
			const result = await run(original);
			expect(result.errors).toBeUndefined();
			const renewed: any = result.data?.refreshSession;
			expect(renewed).toMatchObject({
				_id: id.toHexString(),
				memberType: role,
				memberStatus: 'ACTIVE',
				guestLiked: false,
			});
			const payload = await jwt.verifyAsync(renewed.accessToken);
			expect(Object.keys(payload).sort()).toEqual(['_id', 'exp', 'iat']);
			expect(payload.iat).toBe(now);
			expect(payload.exp).toBe(now + seconds);
			expect(payload.exp).toBeGreaterThan(before.exp);
			expect(auth.createToken).toHaveBeenCalledTimes(1);
			expect(model.findOne).toHaveBeenCalledWith({ _id: id.toHexString(), memberStatus: 'ACTIVE' });
		},
	);
	it.each(['expired', 'tampered', 'anonymous'])('rejects %s credentials before issuing a token', async (type) => {
		const valid = await jwt.signAsync({ _id: id.toHexString() });
		const token =
			type === 'expired'
				? await jwt.signAsync({ _id: id.toHexString(), iat: now - seconds - 1 })
				: type === 'tampered'
					? valid + 'x'
					: undefined;
		expect((await run(token)).errors?.length).toBeGreaterThan(0);
		expect(auth.createToken).not.toHaveBeenCalled();
		expect(model.findOne).not.toHaveBeenCalled();
	});
	it.each([MemberStatus.BLOCK, MemberStatus.DELETE, 'missing'])(
		'rejects %s accounts even with an unexpired token',
		async (status) => {
			const token = await jwt.signAsync({ _id: id.toHexString() });
			if (status === 'missing') member = null;
			else member.memberStatus = status;
			expect((await run(token)).errors?.length).toBeGreaterThan(0);
			expect(auth.createToken).not.toHaveBeenCalled();
		},
	);
	it('accepts no client identity/role input and does not expose passwords', async () => {
		const token = await jwt.signAsync({ _id: id.toHexString() });
		expect(
			(await run(token, 'mutation { refreshSession(memberId:"other") { accessToken } }')).errors?.length,
		).toBeGreaterThan(0);
		expect((await run(token, 'mutation { refreshSession { memberPassword } }')).errors?.length).toBeGreaterThan(0);
		expect(auth.createToken).not.toHaveBeenCalled();
		const renewed = await auth.refreshSession(member);
		expect(renewed.memberPassword).toBeUndefined();
		expect(member.memberPassword).toBe('must-not-leak');
	});
});
