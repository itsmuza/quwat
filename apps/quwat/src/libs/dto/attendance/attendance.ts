import { Field, ObjectType } from '@nestjs/graphql';
import { ObjectId } from 'bson';
import { AttendanceStatus } from '../../enums/attendance.enum';
import { TotalCounter } from '../member/member';

@ObjectType()
export class AttendanceMember {
	@Field(() => String) _id!: ObjectId;
	@Field(() => String) memberNick!: string;
	@Field(() => String, { nullable: true }) memberFullName?: string;
}
@ObjectType()
export class Attendance {
	@Field(() => String) _id!: ObjectId;
	@Field(() => String) memberId!: ObjectId;
	@Field(() => String) attendanceDate!: string;
	@Field(() => AttendanceStatus) attendanceStatus!: AttendanceStatus;
	@Field(() => Date, { nullable: true }) reviewedAt!: Date | null;
	@Field(() => Date) createdAt!: Date;
	@Field(() => Date) updatedAt!: Date;
	@Field(() => AttendanceMember, { nullable: true }) memberData?: AttendanceMember | null;
}
@ObjectType()
export class AttendanceDay {
	@Field(() => String) memberId!: ObjectId;
	@Field(() => String) attendanceDate!: string;
	@Field(() => AttendanceStatus) attendanceStatus!: AttendanceStatus;
	@Field(() => String, { nullable: true }) attendanceId!: ObjectId | null;
	@Field(() => Date, { nullable: true }) requestedAt!: Date | null;
	@Field(() => Date, { nullable: true }) reviewedAt!: Date | null;
	@Field(() => AttendanceMember, { nullable: true }) memberData?: AttendanceMember | null;
}
@ObjectType()
export class Attendances {
	@Field(() => [Attendance]) list!: Attendance[];
	@Field(() => [TotalCounter]) metaCounter!: TotalCounter[];
}
@ObjectType()
export class AttendanceDays {
	@Field(() => [AttendanceDay]) list!: AttendanceDay[];
	@Field(() => [TotalCounter]) metaCounter!: TotalCounter[];
}
