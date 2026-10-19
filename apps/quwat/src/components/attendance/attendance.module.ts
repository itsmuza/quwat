import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import AttendanceSchema from '../../libs/schemas/Attendance.model';
import MemberSchema from '../../libs/schemas/Member.model';
import { AuthModule } from '../auth/auth.module';
import { AttendanceService } from './attendance.service';
import { AttendanceResolver } from './attendance.resolver';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Attendance', schema: AttendanceSchema },
			{ name: 'Member', schema: MemberSchema },
		]),
		AuthModule,
	],
	providers: [AttendanceService, AttendanceResolver],
	exports: [AttendanceService],
})
export class AttendanceModule {}
