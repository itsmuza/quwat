import 'reflect-metadata';
import { ObjectId } from 'bson';
import { MemberService } from './member.service';
import { MemberResolver } from './member.resolver';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';

describe('Admin member list excludes the authenticated member before pagination/count', () => {
	const ownId = new ObjectId();
	const own = { _id: ownId, memberNick: 'ownadmin', memberType: MemberType.ADMIN, memberStatus: MemberStatus.ACTIVE };
	const otherAdmin = { ...own, _id: new ObjectId(), memberNick: 'otheradmin' };
	const clients = Array.from({ length: 20 }, (_, i) => ({
		_id: new ObjectId(),
		memberNick: `client${i}`,
		memberType: MemberType.CLIENT,
		memberStatus: i === 0 ? MemberStatus.BLOCK : MemberStatus.ACTIVE,
	}));
	let model: any, service: MemberService;
	beforeEach(() => {
		model = {
			aggregate: jest.fn((pipeline: any[]) => ({
				exec: async () => {
					const match = pipeline[0].$match;
					const rows = [own, otherAdmin, ...clients].filter(
						(member) =>
							!member._id.equals(match._id.$ne) &&
							(!match.memberType || member.memberType === match.memberType) &&
							(!match.memberStatus || member.memberStatus === match.memberStatus) &&
							(!match.memberNick || match.memberNick.$regex.test(member.memberNick)),
					);
					const list = pipeline[2].$facet.list;
					return [
						{
							list: rows.slice(list[0].$skip, list[0].$skip + list[1].$limit),
							metaCounter: rows.length ? [{ total: rows.length }] : [],
						},
					];
				},
			})),
		};
		service = new MemberService(model, {} as any, {} as any, {} as any);
	});
	it('returns full 20-row pages and counts only other accounts', async () => {
		const first = await service.getAllMembersByAdmin({ page: 1, limit: 20, search: {} }, ownId);
		const second = await service.getAllMembersByAdmin({ page: 2, limit: 20, search: {} }, ownId);
		expect(first.list).toHaveLength(20);
		expect(first.metaCounter).toEqual([{ total: 21 }]);
		expect(second.list).toHaveLength(1);
		expect([...first.list, ...second.list].some((member) => String(member._id) === String(ownId))).toBe(false);
	});
	it('hides an exact own-name search while retaining other administrators', async () => {
		expect(await service.getAllMembersByAdmin({ page: 1, limit: 20, search: { text: '^ownadmin$' } }, ownId)).toEqual({
			list: [],
			metaCounter: [],
		});
		const other = await service.getAllMembersByAdmin(
			{ page: 1, limit: 20, search: { memberType: MemberType.ADMIN } },
			ownId,
		);
		expect(other.list).toEqual([otherAdmin]);
		expect(other.metaCounter).toEqual([{ total: 1 }]);
	});
	it('preserves role/status filters and excludes the caller using MongoDB ObjectId', async () => {
		const result = await service.getAllMembersByAdmin(
			{ page: 1, limit: 20, search: { memberType: MemberType.CLIENT, memberStatus: MemberStatus.BLOCK } },
			ownId,
		);
		expect(result.list).toEqual([clients[0]]);
		expect(model.aggregate.mock.calls[0][0][0].$match._id.$ne).toBeInstanceOf(ObjectId);
	});
	it('does not query an unscoped member list without an authenticated identity', async () => {
		await expect(service.getAllMembersByAdmin({ page: 1, limit: 20, search: {} }, null as any)).rejects.toThrow(
			'Authenticated administrator required',
		);
		expect(model.aggregate).not.toHaveBeenCalled();
	});
	it('resolver forwards the server-authenticated identity rather than input metadata', async () => {
		const memberService = { getAllMembersByAdmin: jest.fn().mockResolvedValue({ list: [], metaCounter: [] }) };
		const resolver = new MemberResolver(memberService as any);
		const input = { page: 1, limit: 20, search: {} };
		await resolver.getAllMembersByAdmin(input, ownId);
		expect(memberService.getAllMembersByAdmin).toHaveBeenCalledWith(input, ownId);
	});
});
