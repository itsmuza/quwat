import { Schema } from 'mongoose';
import { AttendanceStatus, STORED_ATTENDANCE_STATUSES } from '../enums/attendance.enum';
import { isAttendanceDate } from '../validation/attendance-date';

const AttendanceSchema = new Schema(
	{
		memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
		attendanceDate: { type: String, required: true, validate: isAttendanceDate },
		attendanceStatus: {
			type: String,
			enum: STORED_ATTENDANCE_STATUSES,
			default: AttendanceStatus.PENDING,
			required: true,
		},
		reviewedAt: { type: Date, default: null },
	},
	{ timestamps: true, collection: 'attendances' },
);
AttendanceSchema.index({ memberId: 1, attendanceDate: 1 }, { unique: true });
AttendanceSchema.index({ memberId: 1, attendanceDate: -1, _id: -1 });
AttendanceSchema.index({ attendanceStatus: 1, attendanceDate: -1, _id: -1 });
AttendanceSchema.index({ attendanceDate: -1, _id: -1 });
export default AttendanceSchema;
