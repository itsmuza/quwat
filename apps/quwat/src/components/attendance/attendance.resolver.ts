import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AttendanceService } from './attendance.service';
import { Attendance, AttendanceDays, Attendances } from '../../libs/dto/attendance/attendance';
import {
	AdminAttendancesInquiry,
	AgentAttendancesInquiry,
	DailyAttendancesInquiry,
	MyAttendancesInquiry,
	ReviewAttendanceInput,
} from '../../libs/dto/attendance/attendance.input';
import { Member } from '../../libs/dto/member/member';
import { MemberType } from '../../libs/enums/member.enum';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@Resolver()
export class AttendanceResolver {
	constructor(private readonly attendanceService: AttendanceService) {}
	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Attendance)
	requestAttendance(@AuthMember() member: Member): Promise<Attendance> {
		return this.attendanceService.requestAttendance(member);
	}
	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Attendance)
	reviewAttendance(@Args('input') input: ReviewAttendanceInput, @AuthMember() member: Member): Promise<Attendance> {
		return this.attendanceService.reviewAttendance(member, input);
	}
	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Query(() => AttendanceDays)
	getMyAttendances(@Args('input') input: MyAttendancesInquiry, @AuthMember() member: Member): Promise<AttendanceDays> {
		return this.attendanceService.getMyAttendances(member, input);
	}
	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => AttendanceDays)
	getAgentAttendancesByAdmin(
		@Args('input') input: AgentAttendancesInquiry,
		@AuthMember() member: Member,
	): Promise<AttendanceDays> {
		return this.attendanceService.getAgentAttendancesByAdmin(member, input);
	}
	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => Attendances)
	getAllAttendancesByAdmin(
		@Args('input') input: AdminAttendancesInquiry,
		@AuthMember() member: Member,
	): Promise<Attendances> {
		return this.attendanceService.getAllAttendancesByAdmin(member, input);
	}
	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => AttendanceDays)
	getDailyAttendancesByAdmin(
		@Args('input') input: DailyAttendancesInquiry,
		@AuthMember() member: Member,
	): Promise<AttendanceDays> {
		return this.attendanceService.getDailyAttendancesByAdmin(member, input);
	}
}
