import 'reflect-metadata';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { createConnection } from 'mongoose';
import { ComponentsModule } from './components.module';
import { ProductService } from './product/product.service';
import { MemberService } from './member/member.service';
import { CommentService } from './comment/comment.service';
import { AuthService } from './auth/auth.service';
import { SavedProductService } from './saved-product/saved-product.service';
import { SaleService } from './sale/sale.service';
import { AttendanceService } from './attendance/attendance.service';
const connection = createConnection();
@Global()
@Module({ providers: [{ provide: getConnectionToken(), useValue: connection }], exports: [getConnectionToken()] })
class IsolatedDatabaseModule {}

describe('Domain dependency registration', () => {
	it('initializes all retained modules against a disconnected test connection with no Board/Follow/Property models', async () => {
		const module = await Test.createTestingModule({
			imports: [
				ConfigModule.forRoot({
					ignoreEnvFile: true,
					ignoreEnvVars: true,
					load: [() => ({ SECRET_TOKEN: 'isolated-module-test-secret' })],
				}),
				IsolatedDatabaseModule,
				ComponentsModule,
			],
		}).compile();
		try {
			for (const provider of [
				ProductService,
				MemberService,
				CommentService,
				AuthService,
				SavedProductService,
				AttendanceService,
				SaleService,
			])
				expect(module.get(provider)).toBeDefined();
			expect(Object.keys(connection.models).sort()).toEqual([
				'Attendance',
				'Comment',
				'GuestLike',
				'Like',
				'Member',
				'Product',
				'Sale',
				'SaleNotificationRead',
				'SavedProduct',
				'View',
			]);
		} finally {
			await module.close();
			await connection.close();
		}
	});
});
