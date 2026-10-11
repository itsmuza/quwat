import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { Member } from '../../libs/dto/member/member';
import { MemberStatus } from '../../libs/enums/member.enum';

@Injectable()
export class AuthService {
	constructor(
		private jwtService: JwtService,
		@InjectModel('Member') private readonly memberModel: Model<Member>,
	) {}

	async hashPassword(password: string): Promise<string> {
		return bcrypt.hash(password, await bcrypt.genSalt());
	}
	async comparePassword(password: string, hash: string): Promise<boolean> {
		return bcrypt.compare(password, hash);
	}
	async createToken(member: Member): Promise<string> {
		return this.jwtService.signAsync({ _id: String(member._id) });
	}
	async verifyToken(token: string): Promise<Member> {
		try {
			const payload = await this.jwtService.verifyAsync<{ _id: string }>(token);
			if (typeof payload._id !== 'string' || !Types.ObjectId.isValid(payload._id)) throw new Error('Invalid identity');
			const member = await this.memberModel
				.findOne({ _id: payload._id, memberStatus: MemberStatus.ACTIVE })
				.lean()
				.exec();
			if (!member) throw new Error('Inactive identity');
			return member;
		} catch {
			throw new UnauthorizedException('Not authenticated');
		}
	}
}
