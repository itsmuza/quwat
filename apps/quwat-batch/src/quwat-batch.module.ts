import { Module } from '@nestjs/common';
import { QuwatBatchController } from './quwat-batch.controller';
import { QuwatBatchService } from './quwat-batch.service';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { ScheduleModule } from '@nestjs/schedule';
import { MongooseModule } from '@nestjs/mongoose';
import PropertySchema from 'apps/quwat/src/libs/schemas/Property.model';
import MemberSchema from 'apps/quwat/src/libs/schemas/Member.model';

@Module({
	imports: [
		ConfigModule.forRoot(),
		DatabaseModule,
		ScheduleModule.forRoot(),
		MongooseModule.forFeature([{ name: 'Property', schema: PropertySchema }]),
		MongooseModule.forFeature([{ name: 'Member', schema: MemberSchema }]),
	],
	controllers: [QuwatBatchController],
	providers: [QuwatBatchService],
})
export class QuwatBatchModule {}
