import 'reflect-metadata';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { ObjectId } from 'bson';
import { AuthService } from './auth.service';
import { RolesGuard } from './guards/roles.guard';
import { AuthGuard } from './guards/auth.guard';
import { WithoutGuard } from './guards/without.guard';
import { MemberService } from '../member/member.service';
import { MemberType, MemberStatus } from '../../libs/enums/member.enum';
import { MemberInput } from '../../libs/dto/member/member.input';
import { MemberUpdate } from '../../libs/dto/member/member.update';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

const query = (value: unknown): any => ({
	lean: () => query(value),
	select: () => query(value),
	exec: jest.fn().mockResolvedValue(value),
});
const id = new ObjectId();
const context = (token: string): any => {
	const req = { headers: { authorization: `Bearer ${token}` }, body: {} };
	return { contextType: 'graphql', getHandler: () => () => undefined, getArgByIndex: () => ({ req }) };
};

describe('Authentication and role boundaries', () => {
	const jwt = new JwtService({ secret: 'quwat-isolated-test-secret' });
	let model: any;
	let auth: AuthService;
	beforeEach(() => {
		model = { findOne: jest.fn() };
		auth = new AuthService(jwt, model);
	});
	it('rejects a wrong password and accepts the matching password using real bcrypt', async () => {
		const hash = await auth.hashPassword('correct123');
		const member = { _id: id, memberStatus: MemberStatus.ACTIVE, memberPassword: hash };
		model.findOne.mockReturnValue(query(member));
		const service = new MemberService(model, auth, {} as any, {} as any);
		await expect(service.login({ memberNick: 'client', memberPassword: 'wrong123' })).rejects.toThrow('Wrong password');
		await expect(service.login({ memberNick: 'client', memberPassword: 'correct123' })).resolves.toMatchObject({
			accessToken: expect.any(String),
		});
	});
	it('forces CLIENT at signup even if a direct caller forges a privileged role', async () => {
		model.create = jest.fn().mockImplementation(async (input) => ({ ...input, _id: id }));
		const service = new MemberService(model, auth, {} as any, {} as any);
		const member = await service.signup({
			memberNick: 'client',
			memberPhone: '1234567',
			memberPassword: 'correct123',
			memberType: MemberType.ADMIN,
		} as any);
		expect(member.memberType).toBe(MemberType.CLIENT);
		expect(await auth.comparePassword('correct123', model.create.mock.calls[0][0].memberPassword)).toBe(true);
	});
	it('profile input rejects role/status fields and service cannot assign them', async () => {
		const forged = { memberPassword: 'newpass123', memberType: MemberType.ADMIN, memberStatus: MemberStatus.ACTIVE };
		expect(
			validateSync(plainToInstance(MemberUpdate, forged), { whitelist: true, forbidNonWhitelisted: true }).length,
		).toBeGreaterThan(0);
		model.findOneAndUpdate = jest.fn().mockReturnValue(query({ _id: id }));
		const service = new MemberService(model, auth, {} as any, {} as any);
		await service.updateMember(id, forged as any);
		const update = model.findOneAndUpdate.mock.calls[0][1].$set;
		expect(update.memberType).toBeUndefined();
		expect(update.memberStatus).toBeUndefined();
		expect(await auth.comparePassword('newpass123', update.memberPassword)).toBe(true);
	});
	it('hashes admin password updates and only changes the requested member', async () => {
		model.findOneAndUpdate = jest.fn().mockReturnValue(query({ _id: id }));
		const service = new MemberService(model, auth, {} as any, {} as any);
		await service.updateMemberByAdmin({
			_id: id.toHexString(),
			memberPassword: 'newpass123',
			memberType: MemberType.AGENT,
		});
		const [filter, update] = model.findOneAndUpdate.mock.calls[0];
		expect(filter).toEqual({ _id: id.toHexString(), attendanceStartDate: null });
		expect(update.$set.memberType).toBe(MemberType.AGENT);
		expect(await auth.comparePassword('newpass123', update.$set.memberPassword)).toBe(true);
	});
	it('does not expose a privileged signup role in the DTO', () => {
		expect(
			validateSync(
				plainToInstance(MemberInput, {
					memberNick: 'client',
					memberPhone: '123',
					memberPassword: 'correct123',
					memberType: MemberType.ADMIN,
				}),
				{ whitelist: true, forbidNonWhitelisted: true },
			).length,
		).toBeGreaterThan(0);
	});
	it('uses the database role even when the signed token claims ADMIN', async () => {
		const token = await jwt.signAsync({ _id: id.toHexString(), memberType: MemberType.ADMIN });
		model.findOne.mockReturnValue(query({ _id: id, memberType: MemberType.AGENT, memberStatus: MemberStatus.ACTIVE }));
		const reflector = { get: () => [MemberType.ADMIN] } as unknown as Reflector;
		const guard = new RolesGuard(reflector, auth);
		await expect(guard.canActivate(context(token))).rejects.toThrow();
		model.findOne.mockReturnValue(query({ _id: id, memberType: MemberType.ADMIN, memberStatus: MemberStatus.ACTIVE }));
		await expect(guard.canActivate(context(token))).resolves.toBe(true);
	});
	it('rejects a blocked/deleted or missing member with a previously valid token', async () => {
		const token = await jwt.signAsync({ _id: id.toHexString() });
		model.findOne.mockReturnValue(query(null));
		await expect(new AuthGuard(auth).canActivate(context(token))).rejects.toThrow('Not authenticated');
		expect(model.findOne).toHaveBeenCalledWith({ _id: id.toHexString(), memberStatus: MemberStatus.ACTIVE });
		const guest = context(token);
		await expect(new WithoutGuard(auth).canActivate(guest)).resolves.toBe(true);
		expect(guest.getArgByIndex().req.body.authMember).toBeNull();
	});
	it('tokens contain identity only, and tampered tokens are rejected', async () => {
		const token = await auth.createToken({ _id: id, memberPassword: 'hidden', memberType: MemberType.ADMIN } as any);
		const payload = jwt.decode(token) as any;
		expect(payload._id).toBe(id.toHexString());
		expect(payload.memberPassword).toBeUndefined();
		expect(payload.memberType).toBeUndefined();
		await expect(auth.verifyToken(`${token}tampered`)).rejects.toThrow('Not authenticated');
	});
});
