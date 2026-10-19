import { Field, InputType } from '@nestjs/graphql';
import { IsEnum, IsIn, IsMongoId, IsOptional } from 'class-validator';
import { OrdinaryInquiry } from '../product/product.input';
import { AttendanceStatus, STORED_ATTENDANCE_STATUSES } from '../../enums/attendance.enum';
import { IsAttendanceDate } from '../../validation/attendance-date';

@InputType()
export class ReviewAttendanceInput {
	@IsMongoId() @Field(() => String) _id!: string;
	@IsIn([AttendanceStatus.APPROVED, AttendanceStatus.REJECTED])
	@Field(() => AttendanceStatus)
	attendanceStatus!: AttendanceStatus;
}
@InputType()
export class MyAttendancesInquiry extends OrdinaryInquiry {
	@IsOptional() @IsAttendanceDate() @Field(() => String, { nullable: true }) fromDate?: string;
	@IsOptional() @IsAttendanceDate() @Field(() => String, { nullable: true }) toDate?: string;
	@IsOptional()
	@IsEnum(AttendanceStatus)
	@Field(() => AttendanceStatus, { nullable: true })
	attendanceStatus?: AttendanceStatus;
}
@InputType()
export class AgentAttendancesInquiry extends MyAttendancesInquiry {
	@IsMongoId() @Field(() => String) memberId!: string;
}
@InputType()
export class AdminAttendancesInquiry extends OrdinaryInquiry {
	@IsOptional() @IsAttendanceDate() @Field(() => String, { nullable: true }) fromDate?: string;
	@IsOptional() @IsAttendanceDate() @Field(() => String, { nullable: true }) toDate?: string;
	@IsOptional()
	@IsIn(STORED_ATTENDANCE_STATUSES)
	@Field(() => AttendanceStatus, { nullable: true })
	attendanceStatus?: AttendanceStatus;
	@IsOptional() @IsMongoId() @Field(() => String, { nullable: true }) memberId?: string;
}
@InputType()
export class DailyAttendancesInquiry extends OrdinaryInquiry {
	@IsOptional() @IsAttendanceDate() @Field(() => String, { nullable: true }) date?: string;
	@IsOptional()
	@IsEnum(AttendanceStatus)
	@Field(() => AttendanceStatus, { nullable: true })
	attendanceStatus?: AttendanceStatus;
}
