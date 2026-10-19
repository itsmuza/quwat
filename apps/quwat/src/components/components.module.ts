import { AdminDeletionModule } from './admin-deletion/admin-deletion.module';
import { GuestLikeModule } from './guest-like/guest-like.module';
import { Module } from '@nestjs/common';
import { MemberModule } from './member/member.module';
import { ProductModule } from './product/product.module';
import { AuthModule } from './auth/auth.module';
import { CommentModule } from './comment/comment.module';
import { LikeModule } from './like/like.module';
import { ViewModule } from './view/view.module';
import { SavedProductModule } from './saved-product/saved-product.module';
import { SaleModule } from './sale/sale.module';
import { AttendanceModule } from './attendance/attendance.module';

@Module({
	imports: [
		AdminDeletionModule,
		GuestLikeModule,
		MemberModule,
		ProductModule,
		AuthModule,
		CommentModule,
		LikeModule,
		ViewModule,
		SavedProductModule,
		AttendanceModule,
		SaleModule,
	],
})
export class ComponentsModule {}
