import 'reflect-metadata';
import { ObjectId } from 'bson';
import { createConnection } from 'mongoose';
import { AttendanceService } from './attendance.service';
import { MemberService } from '../member/member.service';
import { Member } from '../../libs/dto/member/member';
import { AttendanceStatus as Status } from '../../libs/enums/attendance.enum';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { attendanceToday, isAttendanceDate } from '../../libs/validation/attendance-date';
import AttendanceSchema from '../../libs/schemas/Attendance.model';
import MemberSchema from '../../libs/schemas/Member.model';
import { buildAttendanceInitialization } from '../../../../../scripts/initialize-attendance.cjs';

const agent = {
	_id: new ObjectId().toHexString(),
	memberType: MemberType.AGENT,
	memberStatus: MemberStatus.ACTIVE,
	attendanceStartDate: '2026-10-09',
	memberNick: 'agent1',
} as Member;
const admin = { ...agent, _id: new ObjectId().toHexString(), memberType: MemberType.ADMIN };
const id = new ObjectId();
const query = (value: unknown): any => ({
	lean: () => query(value),
	select: () => query(value),
	sort: () => query(value),
	exec: jest.fn().mockResolvedValue(value),
});
const card = (overrides = {}): any => ({
	_id: id,
	memberId: new ObjectId(agent._id),
	attendanceDate: '2026-10-10',
	attendanceStatus: Status.PENDING,
	createdAt: new Date('2026-10-10T05:00:00Z'),
	updatedAt: new Date('2026-10-10T05:00:00Z'),
	reviewedAt: null,
	...overrides,
});

describe('Attendance date and setup behavior', () => {
	it('uses the Tashkent midnight boundary, independently of process timezone', () => {
		expect(attendanceToday(new Date('2026-10-11T18:59:59.999Z'))).toBe('2026-10-11');
		expect(attendanceToday(new Date('2026-10-11T19:00:00.000Z'))).toBe('2026-10-12');
		expect(attendanceToday(new Date('2026-12-31T19:00:00.000Z'))).toBe('2027-01-01');
	});
	it.each(['2026-02-29', '2026-04-31', '2026-1-01', '2026-10-12T00:00:00Z', 'bad', '0000-01-01', '2026-13-01'])(
		'rejects invalid calendar dates: %s',
		(date) => {
			expect(isAttendanceDate(date)).toBe(false);
		},
	);
	it('accepts actual leap days and validates the prepared setup script without connecting', () => {
		expect(isAttendanceDate('2024-02-29')).toBe(true);
		// Imported CLI entrypoint is guarded by require.main, so this never connects.
		const setup = buildAttendanceInitialization(new Date('2026-10-11T19:00:00Z'));
		expect(setup).toEqual({
			filter: { memberType: 'AGENT', attendanceStartDate: null },
			update: { $set: { attendanceStartDate: '2026-10-12' } },
		});
	});
});

describe('Attendance domain behavior', () => {
	let db: any, members: any, service: AttendanceService;
	beforeEach(() => {
		jest.useFakeTimers().setSystemTime(new Date('2026-10-12T06:00:00Z'));
		db = {
			collection: { createIndex: jest.fn().mockResolvedValue('memberId_1_attendanceDate_1') },
			findOneAndUpdate: jest.fn().mockReturnValue(query(card({ attendanceDate: '2026-10-12' }))),
			findOne: jest.fn().mockReturnValue(query(card())),
			find: jest.fn().mockReturnValue(query([])),
			aggregate: jest.fn().mockReturnValue(query([])),
		};
		members = {
			findOne: jest.fn().mockReturnValue(query({ ...agent, memberPassword: 'must-not-leak' })),
			find: jest.fn().mockReturnValue(query([agent])),
		};
		service = new AttendanceService(db, members);
	});
	afterEach(() => {
		jest.useRealTimers();
	});
	it.each([
		null,
		{ ...agent, memberType: MemberType.CLIENT },
		{ ...agent, memberType: MemberType.ADMIN },
		{ ...agent, memberStatus: MemberStatus.BLOCK },
		{ ...agent, memberStatus: MemberStatus.DELETE },
	])('denies agent operations for %j', async (member) => {
		await expect(service.requestAttendance(member as Member)).rejects.toThrow('Only active AGENT');
		await expect(service.getMyAttendances(member as Member, { page: 1, limit: 10 })).rejects.toThrow(
			'Only active AGENT',
		);
		expect(db.findOneAndUpdate).not.toHaveBeenCalled();
		expect(db.find).not.toHaveBeenCalled();
	});
	it.each([null, agent, { ...agent, memberType: MemberType.CLIENT }, { ...admin, memberStatus: MemberStatus.BLOCK }])(
		'denies admin operations for %j',
		async (member) => {
			await expect(
				service.reviewAttendance(member as Member, { _id: String(id), attendanceStatus: Status.APPROVED }),
			).rejects.toThrow('Only active ADMIN');
			await expect(service.getAllAttendancesByAdmin(member as Member, { page: 1, limit: 10 })).rejects.toThrow(
				'Only active ADMIN',
			);
			await expect(service.getDailyAttendancesByAdmin(member as Member, { page: 1, limit: 10 })).rejects.toThrow(
				'Only active ADMIN',
			);
			expect(db.findOneAndUpdate).not.toHaveBeenCalled();
			expect(members.find).not.toHaveBeenCalled();
		},
	);
	it('admin reads one selected blocked agent calendar with enrollment clipping and virtual absences', async () => {
		members.findOne.mockReturnValue(query({ ...agent, memberStatus: MemberStatus.BLOCK }));
		db.find.mockReturnValue(query([card({ attendanceStatus: Status.APPROVED })]));
		const days = await service.getAgentAttendancesByAdmin(admin, {
			memberId: String(agent._id),
			page: 1,
			limit: 31,
			fromDate: '2026-10-01',
			toDate: '2026-10-31',
		});
		expect(days.list.map((row) => row.attendanceDate)).toEqual([
			'2026-10-12',
			'2026-10-11',
			'2026-10-10',
			'2026-10-09',
		]);
		expect(days.list.map((row) => row.attendanceStatus)).toEqual([
			Status.ABSENT,
			Status.ABSENT,
			Status.APPROVED,
			Status.ABSENT,
		]);
		expect(days.metaCounter).toEqual([{ total: 4 }]);
		expect(members.findOne).toHaveBeenCalledWith({ _id: new ObjectId(agent._id), memberType: MemberType.AGENT });
		expect(db.find).toHaveBeenCalledWith({
			memberId: new ObjectId(agent._id),
			attendanceDate: { $gte: '2026-10-09', $lte: '2026-10-12' },
		});
		expect(JSON.stringify(days)).not.toContain('must-not-leak');
	});
	it.each([null, agent, { ...agent, memberType: MemberType.CLIENT }, { ...admin, memberStatus: MemberStatus.BLOCK }])(
		'denies selected agent calendars to non-active-admin callers',
		async (member) => {
			await expect(
				service.getAgentAttendancesByAdmin(member as Member, { memberId: String(agent._id), page: 1, limit: 31 }),
			).rejects.toThrow('Only active ADMIN');
			expect(members.findOne).not.toHaveBeenCalled();
		},
	);
	it('rejects invalid selected IDs, missing agents, invalid ranges and missing setup without writes', async () => {
		await expect(service.getAgentAttendancesByAdmin(admin, { memberId: 'bad', page: 1, limit: 31 })).rejects.toThrow(
			'Invalid attendance input',
		);
		members.findOne.mockReturnValue(query(null));
		await expect(
			service.getAgentAttendancesByAdmin(admin, { memberId: String(agent._id), page: 1, limit: 31 }),
		).rejects.toThrow('Agent not found');
		members.findOne.mockReturnValue(query(agent));
		await expect(
			service.getAgentAttendancesByAdmin(admin, {
				memberId: String(agent._id),
				page: 1,
				limit: 31,
				fromDate: '2026-10-12',
				toDate: '2026-10-01',
			}),
		).rejects.toThrow('Invalid attendance date range');
		members.findOne.mockReturnValue(query({ ...agent, attendanceStartDate: null }));
		await expect(
			service.getAgentAttendancesByAdmin(admin, { memberId: String(agent._id), page: 1, limit: 31 }),
		).rejects.toThrow('Attendance setup required');
		expect(db.findOneAndUpdate).not.toHaveBeenCalled();
	});
	it('requires setup for requests/my history and daily reports instead of assigning an arbitrary history date', async () => {
		const uninitialized = { ...agent, attendanceStartDate: null };
		await expect(service.requestAttendance(uninitialized)).rejects.toThrow('Attendance setup required');
		await expect(service.getMyAttendances(uninitialized, { page: 1, limit: 10 })).rejects.toThrow(
			'Attendance setup required',
		);
		members.find.mockReturnValue(query([uninitialized]));
		await expect(service.getDailyAttendancesByAdmin(admin, { page: 1, limit: 10 })).rejects.toThrow(
			'Attendance setup required',
		);
		expect(db.findOneAndUpdate).not.toHaveBeenCalled();
	});
	it('does not create a request before the configured enrollment date', async () => {
		await expect(service.requestAttendance({ ...agent, attendanceStartDate: '2026-10-13' })).rejects.toThrow(
			'Attendance tracking has not started',
		);
		expect(db.findOneAndUpdate).not.toHaveBeenCalled();
	});
	it('inserts only once for the server date and returns an existing final decision without reopening it', async () => {
		const rejected = card({ attendanceDate: '2026-10-12', attendanceStatus: Status.REJECTED });
		db.findOneAndUpdate.mockReturnValue(query(rejected));
		expect(await service.requestAttendance(agent)).toEqual(rejected);
		expect(await service.requestAttendance(agent)).toEqual(rejected);
		expect(db.collection.createIndex).toHaveBeenCalledTimes(1);
		const [filter, update, options] = db.findOneAndUpdate.mock.calls[0];
		expect(filter).toEqual({ memberId: new ObjectId(agent._id), attendanceDate: '2026-10-12' });
		expect(Object.keys(update)).toEqual(['$setOnInsert']);
		expect(update.$setOnInsert).toMatchObject({
			...filter,
			attendanceStatus: 'PENDING',
			reviewedAt: null,
			createdAt: new Date('2026-10-12T06:00:00Z'),
		});
		expect(options).toEqual({ upsert: true, new: true, runValidators: true, timestamps: false });
	});
	it('waits for the unique index before writes and retries a failed installation', async () => {
		let resolve!: (name: string) => void;
		db.collection.createIndex.mockReturnValueOnce(
			new Promise<string>((ready) => {
				resolve = ready;
			}),
		);
		const request = service.requestAttendance(agent);
		await Promise.resolve();
		expect(db.findOneAndUpdate).not.toHaveBeenCalled();
		resolve('memberId_1_attendanceDate_1');
		await request;
		const otherService = new AttendanceService(db, members);
		db.collection.createIndex.mockRejectedValueOnce(new Error('index failed'));
		await expect(otherService.requestAttendance(agent)).rejects.toThrow('index failed');
		await otherService.requestAttendance(agent);
		expect(db.collection.createIndex).toHaveBeenCalledTimes(3);
	});
	it('confirms a duplicate race using the exact member/date and propagates unrelated or unconfirmed failures', async () => {
		const duplicate = { code: 11000 };
		db.findOneAndUpdate.mockReturnValue({ lean: () => ({ exec: jest.fn().mockRejectedValue(duplicate) }) });
		expect(await service.requestAttendance(agent)).toEqual(card());
		expect(db.findOne).toHaveBeenCalledWith({ memberId: new ObjectId(agent._id), attendanceDate: '2026-10-12' });
		db.findOne.mockReturnValue(query(null));
		await expect(service.requestAttendance(agent)).rejects.toBe(duplicate);
		const failure = new Error('database unavailable');
		db.findOneAndUpdate.mockReturnValue({ lean: () => ({ exec: jest.fn().mockRejectedValue(failure) }) });
		await expect(service.requestAttendance(agent)).rejects.toBe(failure);
	});
	it.each([Status.APPROVED, Status.REJECTED])(
		'reviews an old pending request atomically as %s and exposes only safe member fields',
		async (status) => {
			db.findOneAndUpdate.mockReturnValue(query(card({ attendanceStatus: status, reviewedAt: new Date() })));
			const result = await service.reviewAttendance(admin, { _id: String(id), attendanceStatus: status });
			expect(db.findOneAndUpdate.mock.calls[0][0]).toEqual({ _id: id, attendanceStatus: Status.PENDING });
			expect(result.attendanceStatus).toBe(status);
			expect(result.memberData).toEqual({
				_id: new ObjectId(agent._id),
				memberNick: agent.memberNick,
				memberFullName: undefined,
			});
			expect(JSON.stringify(result)).not.toContain('must-not-leak');
		},
	);
	it('preserves an identical final decision, rejects a contrary decision and reports missing records', async () => {
		db.findOneAndUpdate.mockReturnValue(query(null));
		const reviewedAt = new Date('2026-10-11T07:00:00Z');
		db.findOne.mockReturnValue(query(card({ attendanceStatus: Status.APPROVED, reviewedAt })));
		expect(
			(await service.reviewAttendance(admin, { _id: String(id), attendanceStatus: Status.APPROVED })).reviewedAt,
		).toBe(reviewedAt);
		await expect(
			service.reviewAttendance(admin, { _id: String(id), attendanceStatus: Status.REJECTED }),
		).rejects.toThrow('final decision');
		db.findOne.mockReturnValue(query(null));
		await expect(
			service.reviewAttendance(admin, { _id: String(id), attendanceStatus: Status.APPROVED }),
		).rejects.toThrow('Attendance not found');
	});
	it('generates ABSENT calendar days, including weekends, before filtering/counting/pagination', async () => {
		db.find.mockReturnValue(query([card({ attendanceStatus: Status.APPROVED })]));
		const result = await service.getMyAttendances(agent, { page: 1, limit: 2 });
		expect(result.metaCounter).toEqual([{ total: 4 }]);
		expect(result.list.map((row) => [row.attendanceDate, row.attendanceStatus])).toEqual([
			['2026-10-12', 'ABSENT'],
			['2026-10-11', 'ABSENT'],
		]);
		expect(result.list[0]).toMatchObject({ attendanceId: null, requestedAt: null, reviewedAt: null });
		const absent = await service.getMyAttendances(agent, { page: 2, limit: 2, attendanceStatus: Status.ABSENT });
		expect(absent.list.map((row) => row.attendanceDate)).toEqual(['2026-10-09']);
		expect(absent.metaCounter).toEqual([{ total: 3 }]);
		const approved = await service.getMyAttendances(agent, { page: 1, limit: 10, attendanceStatus: Status.APPROVED });
		expect(approved.list[0]).toMatchObject({ attendanceId: id, attendanceDate: '2026-10-10' });
		expect(approved.metaCounter).toEqual([{ total: 1 }]);
		expect(db.find).toHaveBeenCalledWith({
			memberId: new ObjectId(agent._id),
			attendanceDate: { $gte: '2026-10-09', $lte: '2026-10-12' },
		});
		expect(db.findOneAndUpdate).not.toHaveBeenCalled();
	});
	it('clips history to enrollment/today, hides future/pre-enrollment days and never reads another agent history', async () => {
		const result = await service.getMyAttendances(agent, {
			page: 1,
			limit: 10,
			fromDate: '2026-01-01',
			toDate: '2027-01-01',
		});
		expect(result.list).toHaveLength(4);
		expect(await service.getMyAttendances(agent, { page: 1, limit: 10, toDate: '2026-10-08' })).toEqual({
			list: [],
			metaCounter: [],
		});
		expect(await service.getMyAttendances(agent, { page: 1, limit: 10, fromDate: '2027-01-01' })).toEqual({
			list: [],
			metaCounter: [],
		});
		const other = { ...agent, _id: new ObjectId().toHexString() };
		await service.getMyAttendances(other, { page: 1, limit: 10 });
		expect(db.find.mock.calls.at(-1)[0].memberId).toEqual(new ObjectId(other._id));
	});
	it('daily reports include blocked agents and ABSENT, exclude later enrollments, and filter before pagination', async () => {
		const blocked = {
			...agent,
			_id: new ObjectId().toHexString(),
			memberNick: 'agent2',
			memberStatus: MemberStatus.BLOCK,
			memberPassword: 'hidden',
		};
		const later = { ...agent, _id: new ObjectId().toHexString(), attendanceStartDate: '2026-10-13' };
		members.find.mockReturnValue(query([agent, blocked, later]));
		db.find.mockReturnValue(query([card({ attendanceDate: '2026-10-12', attendanceStatus: Status.PENDING })]));
		const result = await service.getDailyAttendancesByAdmin(admin, {
			page: 1,
			limit: 1,
			attendanceStatus: Status.ABSENT,
		});
		expect(result.metaCounter).toEqual([{ total: 1 }]);
		expect(result.list[0]).toMatchObject({ memberId: new ObjectId(blocked._id), attendanceStatus: Status.ABSENT });
		expect(Object.keys(result.list[0].memberData!)).toEqual(['_id', 'memberNick', 'memberFullName']);
		expect(members.find.mock.calls[0][0]).toEqual({ memberType: 'AGENT', memberStatus: { $in: ['ACTIVE', 'BLOCK'] } });
		expect(JSON.stringify(result)).not.toContain('hidden');
		expect(await service.getDailyAttendancesByAdmin(admin, { page: 1, limit: 10, date: '2026-10-13' })).toEqual({
			list: [],
			metaCounter: [],
		});
	});
	it('admin history uses ObjectId filters, preserves rows with missing/changed members and projects only safe identity', async () => {
		await service.getAllAttendancesByAdmin(admin, {
			page: 2,
			limit: 10,
			memberId: agent._id,
			fromDate: '2026-10-09',
			toDate: '2026-10-12',
			attendanceStatus: Status.PENDING,
		});
		const pipeline = db.aggregate.mock.calls[0][0];
		expect(pipeline[0].$match).toEqual({
			memberId: new ObjectId(agent._id),
			attendanceStatus: 'PENDING',
			attendanceDate: { $gte: '2026-10-09', $lte: '2026-10-12' },
		});
		expect(pipeline[1]).toEqual({ $sort: { attendanceDate: -1, _id: -1 } });
		expect(pipeline[2].$facet.list[0]).toEqual({ $skip: 10 });
		expect(pipeline[2].$facet.list[2].$lookup.pipeline).toEqual([
			{ $project: { _id: 1, memberNick: 1, memberFullName: 1 } },
		]);
		expect(JSON.stringify(pipeline)).not.toContain('memberStatus');
	});
	it.each([
		{ page: 0, limit: 10 },
		{ page: 1, limit: 101 },
		{ page: 1, limit: 10, fromDate: '2026-02-29' },
		{ page: 1, limit: 10, fromDate: '2026-10-12', toDate: '2026-10-01' },
		{ page: 1, limit: 10, memberId: String(id) },
	])('rejects invalid/forged personal inquiry %j', async (input) => {
		await expect(service.getMyAttendances(agent, input)).rejects.toThrow();
		expect(db.find).not.toHaveBeenCalled();
	});
	it.each([Status.ABSENT, Status.PENDING])('cannot review a request as %s', async (status) => {
		await expect(service.reviewAttendance(admin, { _id: String(id), attendanceStatus: status })).rejects.toThrow(
			'Invalid attendance input',
		);
	});
	it('rejects malformed IDs, forged review fields, virtual ABSENT in stored history, and invalid daily dates', async () => {
		await expect(service.reviewAttendance(admin, { _id: 'bad', attendanceStatus: Status.APPROVED })).rejects.toThrow();
		await expect(
			service.reviewAttendance(admin, {
				_id: String(id),
				attendanceStatus: Status.APPROVED,
				reviewedAt: new Date(),
			} as any),
		).rejects.toThrow();
		await expect(
			service.getAllAttendancesByAdmin(admin, { page: 1, limit: 10, attendanceStatus: Status.ABSENT }),
		).rejects.toThrow();
		await expect(
			service.getDailyAttendancesByAdmin(admin, { page: 1, limit: 10, date: '2026-04-31' }),
		).rejects.toThrow();
	});
});

describe('Mongoose attendance schema and agent promotion', () => {
	const connection = createConnection();
	const Card = connection.model('AttendanceValidationTest', AttendanceSchema);
	const Members = connection.model('AttendanceMemberValidationTest', MemberSchema);
	afterAll(async () => {
		await connection.close();
	});
	afterEach(() => {
		jest.restoreAllMocks();
	});
	it('rejects stored ABSENT/invalid dates and keeps the unique member/day index', async () => {
		await expect(new Card({ memberId: agent._id, attendanceDate: '2026-10-12' }).validate()).resolves.toBeUndefined();
		await expect(new Card({ memberId: agent._id, attendanceDate: '2026-02-29' }).validate()).rejects.toThrow();
		await expect(
			new Card({ memberId: agent._id, attendanceDate: '2026-10-12', attendanceStatus: Status.ABSENT }).validate(),
		).rejects.toThrow();
		expect(AttendanceSchema.indexes()[0]).toEqual([
			{ memberId: 1, attendanceDate: 1 },
			{ unique: true, background: true },
		]);
	});
	it('real query middleware keeps request retries insert-only and preserves the stored final decision/time', async () => {
		let stored: any = null;
		jest.spyOn(Card.collection, 'createIndex').mockResolvedValue('memberId_1_attendanceDate_1');
		jest
			.spyOn(Card.collection, 'findOneAndUpdate')
			.mockImplementation(async (_filter: any, update: any, options: any) => {
				expect(update.$set).toBeUndefined();
				expect(options.upsert).toBe(true);
				stored ??= { _id: id, ...update.$setOnInsert };
				return { ...stored };
			});
		const service = new AttendanceService(Card as any, {} as any);
		const enrolled = { ...agent, attendanceStartDate: attendanceToday() };
		const first = await service.requestAttendance(enrolled);
		stored.attendanceStatus = Status.REJECTED;
		const retry = await service.requestAttendance(enrolled);
		expect(retry.attendanceStatus).toBe(Status.REJECTED);
		expect(retry.createdAt).toEqual(first.createdAt);
		expect(retry.updatedAt).toEqual(first.updatedAt);
	});
	it('assigns first enrollment atomically with promotion and preserves it when AGENT is assigned again', async () => {
		const first = attendanceToday();
		let started: string | null = null;
		const writes: any[] = [];
		jest.spyOn(Members.collection, 'findOneAndUpdate').mockImplementation(async (filter: any, update: any) => {
			writes.push({ filter, update });
			if (filter.attendanceStartDate === null && started) return null;
			started ??= update.$set.attendanceStartDate ?? null;
			return { ...agent, attendanceStartDate: started } as any;
		});
		const service = new MemberService(Members as any, {} as any, {} as any, {} as any);
		await service.updateMemberByAdmin({ _id: agent._id, memberType: MemberType.AGENT });
		expect(started).toBe(first);
		started = '2020-01-01';
		await service.updateMemberByAdmin({
			_id: agent._id,
			memberType: MemberType.AGENT,
			attendanceStartDate: '2099-01-01',
		} as any);
		expect(started).toBe('2020-01-01');
		expect(writes.at(-1).update.$set.attendanceStartDate).toBeUndefined();
	});
});
