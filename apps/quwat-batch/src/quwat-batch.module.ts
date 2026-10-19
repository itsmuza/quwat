import { Module } from '@nestjs/common';
import { QuwatBatchController } from './quwat-batch.controller';
import { QuwatBatchService } from './quwat-batch.service';
import { ConfigModule } from '@nestjs/config';
import { environmentFiles, validateEnvironment } from 'apps/quwat/src/libs/config/environment';
import { DatabaseModule } from './database/database.module';
import { ScheduleModule } from '@nestjs/schedule';
import { MongooseModule } from '@nestjs/mongoose';
import ProductSchema from 'apps/quwat/src/libs/schemas/Product.model';
import MemberSchema from 'apps/quwat/src/libs/schemas/Member.model';

@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true, envFilePath: environmentFiles(), validate: validateEnvironment }),
		DatabaseModule,
		ScheduleModule.forRoot(),
		MongooseModule.forFeature([{ name: 'Product', schema: ProductSchema }]),
		MongooseModule.forFeature([{ name: 'Member', schema: MemberSchema }]),
	],
	controllers: [QuwatBatchController],
	providers: [QuwatBatchService],
})
export class QuwatBatchModule {}
