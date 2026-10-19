import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ObjectId } from 'bson';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Member } from '../../libs/dto/member/member';
import {
	Attendance,
	AttendanceDay,
	AttendanceDays,
	AttendanceMember,
	Attendances,
} from '../../libs/dto/attendance/attendance';
import {
	AdminAttendancesInquiry,
	AgentAttendancesInquiry,
	DailyAttendancesInquiry,
	MyAttendancesInquiry,
	ReviewAttendanceInput,
} from '../../libs/dto/attendance/attendance.input';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { AttendanceStatus } from '../../libs/enums/attendance.enum';
import { attendanceToday, dateOrdinal, isAttendanceDate, ordinalDate } from '../../libs/validation/attendance-date';
import { shapeIntoMongoObject } from '../../libs/config';

function checked<T extends object>(type: new () => T, input: T): T {
	if (!input || typeof input !== 'object') throw new BadRequestException('Invalid attendance input');
	const dto = plainToInstance(type, input);
	if (validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length)
		throw new BadRequestException('Invalid attendance input');
	return dto;
}
const safeMemberProjection = { _id: 1, memberNick: 1, memberFullName: 1 };
const emptyDays = (): AttendanceDays => ({ list: [], metaCounter: [] });

@Injectable()
export class AttendanceService {
	private uniqueIndexReady?: Promise<string>;
	constructor(
		@InjectModel('Attendance') private readonly attendanceModel: Model<Attendance>,
		@InjectModel('Member') private readonly memberModel: Model<Member>,
	) {}
	private assertRole(member: Member | null, role: MemberType): asserts member is Member {
		if (!member || member.memberStatus !== MemberStatus.ACTIVE || member.memberType !== role)
			throw new ForbiddenException(`Only active ${role} members can use this attendance operation`);
	}
	private startDate(member: Pick<Member, 'attendanceStartDate'>): string {
		if (!isAttendanceDate(member.attendanceStartDate))
			throw new ConflictException('Attendance setup required: initialize attendanceStartDate for existing agents');
		return member.attendanceStartDate;
	}
	private checkRange(input: { fromDate?: string; toDate?: string }): void {
		if (input.fromDate && input.toDate && input.fromDate > input.toDate)
			throw new BadRequestException('Invalid attendance date range');
	}
	private async ensureUniqueIndex(): Promise<void> {
		try {
			this.uniqueIndexReady ??= this.attendanceModel.collection.createIndex(
				{ memberId: 1, attendanceDate: 1 },
				{ unique: true },
			);
			await this.uniqueIndexReady;
		} catch (error) {
			this.uniqueIndexReady = undefined;
			throw error;
		}
	}
	async requestAttendance(member: Member): Promise<Attendance> {
		this.assertRole(member, MemberType.AGENT);
		const now = new Date(),
			attendanceDate = attendanceToday(now);
		if (this.startDate(member) > attendanceDate) throw new ConflictException('Attendance tracking has not started');
		const filter = { memberId: shapeIntoMongoObject(member._id), attendanceDate };
		await this.ensureUniqueIndex();
		try {
			return (await this.attendanceModel
				.findOneAndUpdate(
					filter,
					{
						$setOnInsert: {
							...filter,
							attendanceStatus: AttendanceStatus.PENDING,
							reviewedAt: null,
							createdAt: now,
							updatedAt: now,
						},
					},
					{ upsert: true, new: true, runValidators: true, timestamps: false },
				)
				.lean()
				.exec())!;
		} catch (error) {
			if (error?.code === 11000) {
				const existing = await this.attendanceModel.findOne(filter).lean().exec();
				if (existing) return existing;
			}
			throw error;
		}
	}
	async reviewAttendance(admin: Member, input: ReviewAttendanceInput): Promise<Attendance> {
		this.assertRole(admin, MemberType.ADMIN);
		const dto = checked(ReviewAttendanceInput, input),
			_id = shapeIntoMongoObject(dto._id);
		let result = await this.attendanceModel
			.findOneAndUpdate(
				{ _id, attendanceStatus: AttendanceStatus.PENDING },
				{ $set: { attendanceStatus: dto.attendanceStatus, reviewedAt: new Date() } },
				{ new: true, runValidators: true },
			)
			.lean()
			.exec();
		if (!result) {
			result = await this.attendanceModel.findOne({ _id }).lean().exec();
			if (!result) throw new NotFoundException('Attendance not found');
			if (result.attendanceStatus !== dto.attendanceStatus)
				throw new ConflictException('Attendance already has a final decision');
		}
		const author = await this.memberModel.findOne({ _id: result.memberId }).select(safeMemberProjection).lean().exec();
		return {
			...result,
			memberData: author
				? {
						_id: shapeIntoMongoObject(author._id),
						memberNick: author.memberNick,
						memberFullName: author.memberFullName,
					}
				: null,
		};
	}
	private day(
		memberId: ObjectId,
		attendanceDate: string,
		record?: Attendance,
		memberData?: AttendanceMember,
	): AttendanceDay {
		return {
			memberId,
			attendanceDate,
			attendanceStatus: record?.attendanceStatus ?? AttendanceStatus.ABSENT,
			attendanceId: record?._id ?? null,
			requestedAt: record?.createdAt ?? null,
			reviewedAt: record?.reviewedAt ?? null,
			memberData,
		};
	}
	async getMyAttendances(member: Member, input: MyAttendancesInquiry): Promise<AttendanceDays> {
		this.assertRole(member, MemberType.AGENT);
		const dto = checked(MyAttendancesInquiry, input);
		return this.calendar(member, dto);
	}
	async getAgentAttendancesByAdmin(admin: Member, input: AgentAttendancesInquiry): Promise<AttendanceDays> {
		this.assertRole(admin, MemberType.ADMIN);
		const dto = checked(AgentAttendancesInquiry, input);
		const agent = await this.memberModel
			.findOne({ _id: shapeIntoMongoObject(dto.memberId), memberType: MemberType.AGENT })
			.select({ _id: 1, attendanceStartDate: 1 })
			.lean()
			.exec();
		if (!agent) throw new NotFoundException('Agent not found');
		return this.calendar(agent, dto);
	}
	private async calendar(
		member: Pick<Member, '_id' | 'attendanceStartDate'>,
		dto: MyAttendancesInquiry,
	): Promise<AttendanceDays> {
		this.checkRange(dto);
		const start = this.startDate(member),
			today = attendanceToday();
		const from = dto.fromDate && dto.fromDate > start ? dto.fromDate : start;
		const to = dto.toDate && dto.toDate < today ? dto.toDate : today;
		if (from > to) return emptyDays();
		const memberId = shapeIntoMongoObject(member._id);
		const records = await this.attendanceModel
			.find({ memberId, attendanceDate: { $gte: from, $lte: to } })
			.lean()
			.exec();
		const byDate = new Map(records.map((record) => [record.attendanceDate, record]));
		const offset = (dto.page - 1) * dto.limit;
		const list: AttendanceDay[] = [];
		let total = 0;
		const firstOrdinal = dateOrdinal(from);
		for (let ordinal = dateOrdinal(to); ordinal >= firstOrdinal; ordinal--) {
			const date = ordinalDate(ordinal),
				record = byDate.get(date);
			const status = record?.attendanceStatus ?? AttendanceStatus.ABSENT;
			if (dto.attendanceStatus && dto.attendanceStatus !== status) continue;
			if (total >= offset && list.length < dto.limit) list.push(this.day(memberId, date, record));
			total++;
		}
		return { list, metaCounter: total ? [{ total }] : [] };
	}
	async getAllAttendancesByAdmin(admin: Member, input: AdminAttendancesInquiry): Promise<Attendances> {
		this.assertRole(admin, MemberType.ADMIN);
		const dto = checked(AdminAttendancesInquiry, input);
		this.checkRange(dto);
		const match: Record<string, any> = {};
		if (dto.memberId) match.memberId = shapeIntoMongoObject(dto.memberId);
		if (dto.attendanceStatus) match.attendanceStatus = dto.attendanceStatus;
		if (dto.fromDate || dto.toDate)
			match.attendanceDate = {
				...(dto.fromDate ? { $gte: dto.fromDate } : {}),
				...(dto.toDate ? { $lte: dto.toDate } : {}),
			};
		const data = await this.attendanceModel
			.aggregate<Attendances>([
				{ $match: match },
				{ $sort: { attendanceDate: -1, _id: -1 } },
				{
					$facet: {
						list: [
							{ $skip: (dto.page - 1) * dto.limit },
							{ $limit: dto.limit },
							{
								$lookup: {
									from: 'members',
									localField: 'memberId',
									foreignField: '_id',
									pipeline: [{ $project: safeMemberProjection }],
									as: 'memberData',
								},
							},
							{ $set: { memberData: { $ifNull: [{ $arrayElemAt: ['$memberData', 0] }, null] } } },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return data[0] ?? { list: [], metaCounter: [] };
	}
	async getDailyAttendancesByAdmin(admin: Member, input: DailyAttendancesInquiry): Promise<AttendanceDays> {
		this.assertRole(admin, MemberType.ADMIN);
		const dto = checked(DailyAttendancesInquiry, input),
			today = attendanceToday(),
			date = dto.date ?? today;
		if (date > today) return emptyDays();
		const agents = await this.memberModel
			.find({ memberType: MemberType.AGENT, memberStatus: { $in: [MemberStatus.ACTIVE, MemberStatus.BLOCK] } })
			.select({ ...safeMemberProjection, attendanceStartDate: 1 })
			.sort({ memberNick: 1, _id: 1 })
			.lean()
			.exec();
		const eligible = agents.filter((agent) => this.startDate(agent) <= date);
		if (!eligible.length) return emptyDays();
		const records = await this.attendanceModel
			.find({ memberId: { $in: eligible.map((agent) => shapeIntoMongoObject(agent._id)) }, attendanceDate: date })
			.lean()
			.exec();
		const byMember = new Map(records.map((record) => [String(record.memberId), record]));
		const rows = eligible
			.map((agent) =>
				this.day(shapeIntoMongoObject(agent._id), date, byMember.get(String(agent._id)), {
					_id: shapeIntoMongoObject(agent._id),
					memberNick: agent.memberNick,
					memberFullName: agent.memberFullName,
				}),
			)
			.filter((row) => !dto.attendanceStatus || row.attendanceStatus === dto.attendanceStatus);
		return {
			list: rows.slice((dto.page - 1) * dto.limit, dto.page * dto.limit),
			metaCounter: rows.length ? [{ total: rows.length }] : [],
		};
	}
}
