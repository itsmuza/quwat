import 'reflect-metadata';
import { Global, INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { GraphQLModule, GraphQLSchemaHost } from '@nestjs/graphql';
import { ApolloDriver } from '@nestjs/apollo';
import { createConnection } from 'mongoose';
import { graphql, GraphQLObjectType, parse, printSchema, validate } from 'graphql';
import { ObjectId } from 'bson';
import { AttendanceModule } from './attendance.module';
import { AuthService } from '../auth/auth.service';
import { Member } from '../../libs/dto/member/member';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';

const connection = createConnection();
@Global()
@Module({ providers: [{ provide: getConnectionToken(), useValue: connection }], exports: [getConnectionToken()] })
class IsolatedDatabaseModule {}
const query = (value: unknown): any => ({
	lean: () => query(value),
	select: () => query(value),
	sort: () => query(value),
	exec: jest.fn().mockResolvedValue(value),
});
const agent = {
	_id: new ObjectId().toHexString(),
	memberType: MemberType.AGENT,
	memberStatus: MemberStatus.ACTIVE,
	attendanceStartDate: '2026-10-10',
	memberNick: 'agent1',
} as Member;
const other = { ...agent, _id: new ObjectId().toHexString(), memberNick: 'agent2' };
const admin = { ...agent, _id: new ObjectId().toHexString(), memberType: MemberType.ADMIN, memberNick: 'admin' };

describe('Attendance through Nest GraphQL execution (isolated storage)', () => {
	let app: INestApplication, auth: AuthService;
	let members: Map<string, Member>, records: Map<string, any>;
	const memberModel = {
		findOne: jest.fn((filter: any) => {
			const member = members.get(String(filter._id));
			return query(member && (!filter.memberStatus || member.memberStatus === filter.memberStatus) ? member : null);
		}),
		find: jest.fn(() =>
			query(
				[...members.values()]
					.filter((member) => member.memberType === MemberType.AGENT && member.memberStatus !== MemberStatus.DELETE)
					.sort((a, b) => a.memberNick.localeCompare(b.memberNick)),
			),
		),
	};
	const attendanceModel = {
		collection: { createIndex: jest.fn().mockResolvedValue('memberId_1_attendanceDate_1') },
		findOneAndUpdate: jest.fn((filter: any, update: any) => {
			if (filter._id) {
				const record = [...records.values()].find((value) => value._id.equals(filter._id));
				if (!record || record.attendanceStatus !== filter.attendanceStatus) return query(null);
				Object.assign(record, update.$set, { updatedAt: new Date() });
				return query({ ...record });
			}
			const key = `${filter.memberId}:${filter.attendanceDate}`;
			if (!records.has(key)) records.set(key, { _id: new ObjectId(), ...update.$setOnInsert });
			return query({ ...records.get(key) });
		}),
		findOne: jest.fn((filter: any) =>
			query(
				[...records.values()].find((value) =>
					filter._id
						? value._id.equals(filter._id)
						: String(value.memberId) === String(filter.memberId) && value.attendanceDate === filter.attendanceDate,
				) ?? null,
			),
		),
		find: jest.fn((filter: any) =>
			query(
				[...records.values()].filter((record) => {
					const own = filter.memberId.$in
						? filter.memberId.$in.some((value: ObjectId) => String(value) === String(record.memberId))
						: String(filter.memberId) === String(record.memberId);
					const date =
						typeof filter.attendanceDate === 'string'
							? record.attendanceDate === filter.attendanceDate
							: record.attendanceDate >= filter.attendanceDate.$gte &&
								record.attendanceDate <= filter.attendanceDate.$lte;
					return own && date;
				}),
			),
		),
		aggregate: jest.fn(() => query([])),
	};
	beforeAll(async () => {
		const module = await Test.createTestingModule({
			imports: [
				ConfigModule.forRoot({
					ignoreEnvFile: true,
					ignoreEnvVars: true,
					load: [() => ({ SECRET_TOKEN: 'attendance-isolated-test-secret' })],
				}),
				IsolatedDatabaseModule,
				GraphQLModule.forRoot({ driver: ApolloDriver, autoSchemaFile: true }),
				AttendanceModule,
			],
		})
			.overrideProvider(getModelToken('Attendance'))
			.useValue(attendanceModel)
			.overrideProvider(getModelToken('Member'))
			.useValue(memberModel)
			.compile();
		app = module.createNestApplication({ logger: false });
		app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
		await app.init();
		auth = app.get(AuthService);
	});
	afterAll(async () => {
		await app?.close();
		await connection.close();
	});
	beforeEach(() => {
		jest.clearAllMocks();
		jest
			.useFakeTimers({
				doNotFake: [
					'nextTick',
					'queueMicrotask',
					'setImmediate',
					'clearImmediate',
					'setTimeout',
					'clearTimeout',
					'setInterval',
					'clearInterval',
				],
			})
			.setSystemTime(new Date('2026-10-12T06:00:00Z'));
		jest.spyOn(console, 'info').mockImplementation(() => undefined);
		jest.spyOn(console, 'log').mockImplementation(() => undefined);
		members = new Map([agent, other, admin].map((member) => [member._id, { ...member }]));
		records = new Map();
	});
	afterEach(() => {
		jest.restoreAllMocks();
		jest.useRealTimers();
	});
	async function run(source: string, member: Member | null = agent, variableValues: any = {}) {
		const token = member ? await auth.createToken(member) : null;
		return graphql({
			schema: app.get(GraphQLSchemaHost).schema,
			source,
			variableValues,
			contextValue: { req: { headers: token ? { authorization: `Bearer ${token}` } : {}, body: {} } },
		});
	}
	const request =
		'mutation { requestAttendance { _id memberId attendanceDate attendanceStatus createdAt reviewedAt } }';
	const history =
		'{ getMyAttendances(input: { page: 1, limit: 10 }) { list { attendanceDate attendanceStatus attendanceId requestedAt reviewedAt } metaCounter { total } } }';
	const review =
		'mutation Review($input: ReviewAttendanceInput!) { reviewAttendance(input: $input) { _id attendanceStatus reviewedAt memberData { _id memberNick memberFullName } } }';
	const daily =
		'{ getDailyAttendancesByAdmin(input: { page: 1, limit: 10 }) { list { memberId attendanceDate attendanceStatus attendanceId memberData { memberNick } } metaCounter { total } } }';
	const all = '{ getAllAttendancesByAdmin(input: { page: 1, limit: 10 }) { list { _id } } }';

	it('admin selects another agent calendar through real guards and strict input validation', async () => {
		await run(request, other);
		const source = `query { getAgentAttendancesByAdmin(input: { memberId: "${other._id}", page: 1, limit: 31, fromDate: "2026-10-01", toDate: "2026-10-31" }) { list { memberId attendanceDate attendanceStatus } metaCounter { total } } }`;
		const response = await run(source, admin);
		expect(response.errors).toBeUndefined();
		expect(response.data?.getAgentAttendancesByAdmin).toMatchObject({
			list: [
				{ memberId: other._id, attendanceDate: '2026-10-12', attendanceStatus: 'PENDING' },
				{ attendanceStatus: 'ABSENT' },
				{ attendanceStatus: 'ABSENT' },
			],
			metaCounter: [{ total: 3 }],
		});
		for (const caller of [null, agent, { ...agent, memberType: MemberType.CLIENT } as Member])
			expect((await run(source, caller)).errors?.length).toBeGreaterThan(0);
		expect((await run(source.replace(other._id, 'bad-id'), admin)).errors?.length).toBeGreaterThan(0);
	});
	it('executes request, repeat, approval and virtual ABSENT history through real guards and DTOs', async () => {
		const result = await run(request);
		expect(result.errors).toBeUndefined();
		const card = result.data?.requestAttendance as any;
		expect(card).toMatchObject({
			memberId: agent._id,
			attendanceDate: '2026-10-12',
			attendanceStatus: 'PENDING',
			reviewedAt: null,
		});
		expect((await run(request)).data?.requestAttendance).toEqual(card);
		const approved = await run(review, admin, { input: { _id: card._id, attendanceStatus: 'APPROVED' } });
		expect(approved.errors).toBeUndefined();
		expect(approved.data?.reviewAttendance).toMatchObject({
			attendanceStatus: 'APPROVED',
			memberData: { _id: agent._id, memberNick: 'agent1' },
		});
		const days = await run(history);
		expect(days.errors).toBeUndefined();
		expect((days.data?.getMyAttendances as any).list.map((row: any) => row.attendanceStatus)).toEqual([
			'APPROVED',
			'ABSENT',
			'ABSENT',
		]);
		expect((await run(history, other)).data?.getMyAttendances).toMatchObject({
			list: [
				{ attendanceStatus: 'ABSENT', attendanceId: null },
				{ attendanceStatus: 'ABSENT' },
				{ attendanceStatus: 'ABSENT' },
			],
		});
		expect(records.size).toBe(1);
	});
	it('shows pending and absent agents to the admin and applies status filtering before count', async () => {
		await run(request);
		const report = await run(daily, admin);
		expect(report.errors).toBeUndefined();
		expect((report.data?.getDailyAttendancesByAdmin as any).list.map((row: any) => row.attendanceStatus)).toEqual([
			'PENDING',
			'ABSENT',
		]);
		const absent = await run(
			'{ getDailyAttendancesByAdmin(input: { page: 1, limit: 1, attendanceStatus: ABSENT }) { list { memberId } metaCounter { total } } }',
			admin,
		);
		expect(absent.data?.getDailyAttendancesByAdmin).toEqual({
			list: [{ memberId: other._id }],
			metaCounter: [{ total: 1 }],
		});
	});
	it('parallel requests produce one record; conflicting parallel reviews yield one winner', async () => {
		const responses = await Promise.all([run(request), run(request)]);
		expect(responses.every((result) => !result.errors)).toBe(true);
		expect(records.size).toBe(1);
		const card = responses[0].data?.requestAttendance as any;
		const decisions = await Promise.all(
			['APPROVED', 'REJECTED'].map((status) =>
				run(review, admin, { input: { _id: card._id, attendanceStatus: status } }),
			),
		);
		expect(decisions.filter((result) => !result.errors)).toHaveLength(1);
		expect(decisions.filter((result) => result.errors)).toHaveLength(1);
		const stored = [...records.values()][0];
		const reviewedAt = stored.reviewedAt;
		const repeat = await run(review, admin, { input: { _id: card._id, attendanceStatus: stored.attendanceStatus } });
		expect(repeat.errors).toBeUndefined();
		expect(stored.reviewedAt).toBe(reviewedAt);
	});
	it.each(['guest', 'CLIENT', 'BLOCK', 'DELETE', 'changed-role'])(
		'uses the current database role/status and rejects unauthorized %s',
		async (state) => {
			if (state === 'CLIENT' || state === 'changed-role')
				members.set(agent._id, { ...agent, memberType: MemberType.CLIENT });
			if (state === 'BLOCK' || state === 'DELETE')
				members.set(agent._id, { ...agent, memberStatus: state as MemberStatus });
			for (const source of [request, history, daily, all])
				expect((await run(source, state === 'guest' ? null : agent)).errors?.length).toBeGreaterThan(0);
			expect(attendanceModel.findOneAndUpdate).not.toHaveBeenCalled();
		},
	);
	it('enforces agent/admin boundaries in both directions', async () => {
		expect((await run(request, admin)).errors?.length).toBeGreaterThan(0);
		expect((await run(history, admin)).errors?.length).toBeGreaterThan(0);
		expect(
			(await run(review, agent, { input: { _id: new ObjectId().toHexString(), attendanceStatus: 'APPROVED' } })).errors
				?.length,
		).toBeGreaterThan(0);
		expect((await run(daily, agent)).errors?.length).toBeGreaterThan(0);
	});
	it('rejects forged dates/identities/start metadata, invalid calendar dates and invalid review statuses', async () => {
		for (const source of [
			`mutation { requestAttendance(memberId: "${other._id}", attendanceDate: "2026-10-11") { _id } }`,
			`{ getMyAttendances(input: { page: 1, limit: 10, memberId: "${other._id}" }) { list { memberId } } }`,
			'{ getMyAttendances(input: { page: 1, limit: 10, fromDate: "2026-02-29" }) { list { memberId } } }',
			'{ getMyAttendances(input: { page: 0, limit: 10 }) { list { memberId } } }',
		])
			expect((await run(source)).errors?.length).toBeGreaterThan(0);
		const invalid = await run(review, admin, {
			input: { _id: new ObjectId().toHexString(), attendanceStatus: 'ABSENT' },
		});
		expect(invalid.errors?.length).toBeGreaterThan(0);
		expect(attendanceModel.findOneAndUpdate).not.toHaveBeenCalled();
	});
	it('reports missing setup explicitly without creating a request or virtual history', async () => {
		members.set(agent._id, { ...agent, attendanceStartDate: null });
		for (const source of [request, history])
			expect((await run(source)).errors?.[0].message).toContain('Attendance setup required');
		expect((await run(daily, admin)).errors?.[0].message).toContain('Attendance setup required');
		expect(records.size).toBe(0);
	});
	it('generated attendance contract exposes only safe member fields and prevents caller-supplied request metadata', () => {
		const schema = app.get(GraphQLSchemaHost).schema,
			sdl = printSchema(schema);
		expect(sdl).toContain('requestAttendance: Attendance!');
		expect(sdl).toContain('getMyAttendances(input: MyAttendancesInquiry!): AttendanceDays!');
		expect(sdl).not.toMatch(/memberPassword|attendanceStartDate/);
		expect(Object.keys((schema.getType('AttendanceMember') as GraphQLObjectType).getFields()).sort()).toEqual([
			'_id',
			'memberFullName',
			'memberNick',
		]);
		expect(validate(schema, parse(request))).toHaveLength(0);
	});
});
