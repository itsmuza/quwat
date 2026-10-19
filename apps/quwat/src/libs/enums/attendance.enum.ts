import { registerEnumType } from '@nestjs/graphql';

export enum AttendanceStatus {
	ABSENT = 'ABSENT',
	PENDING = 'PENDING',
	APPROVED = 'APPROVED',
	REJECTED = 'REJECTED',
}
export const STORED_ATTENDANCE_STATUSES = [
	AttendanceStatus.PENDING,
	AttendanceStatus.APPROVED,
	AttendanceStatus.REJECTED,
];
registerEnumType(AttendanceStatus, { name: 'AttendanceStatus' });
