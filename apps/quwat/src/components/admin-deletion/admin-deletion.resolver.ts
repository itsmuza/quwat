import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AdminDeletionService } from './admin-deletion.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MemberType } from '../../libs/enums/member.enum';
import { Member } from '../../libs/dto/member/member';
@Resolver()
export class AdminDeletionResolver {
	constructor(private readonly service: AdminDeletionService) {}
	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Boolean)
	deleteProductPermanentlyByAdmin(@Args('productId') id: string, @AuthMember() admin: Member): Promise<boolean> {
		return this.service.deleteProduct(admin, id);
	}
	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Boolean)
	deleteMemberPermanentlyByAdmin(@Args('memberId') id: string, @AuthMember() admin: Member): Promise<boolean> {
		return this.service.deleteMember(admin, id);
	}
}
