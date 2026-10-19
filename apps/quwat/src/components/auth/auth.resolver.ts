import { Mutation, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './guards/auth.guard';
import { AuthMember } from './decorators/authMember.decorator';
import { Member } from '../../libs/dto/member/member';

@Resolver()
export class AuthResolver {
	constructor(private readonly authService: AuthService) {}

	@UseGuards(AuthGuard)
	@Mutation(() => Member)
	async refreshSession(@AuthMember() member: Member): Promise<Member> {
		return this.authService.refreshSession(member);
	}
}
