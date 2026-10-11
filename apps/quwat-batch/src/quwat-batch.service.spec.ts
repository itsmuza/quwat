import 'reflect-metadata';
import { ObjectId } from 'bson';
import { QuwatBatchService } from './quwat-batch.service';
import { ProductStatus } from 'apps/quwat/src/libs/enums/product.enum';
import { MemberStatus, MemberType } from 'apps/quwat/src/libs/enums/member.enum';
const query = (value: unknown): any => ({ exec: jest.fn().mockResolvedValue(value) });
describe('Quwat product and agent ranking', () => {
	it('ranks active products from likes/views and agents from social activity alone', async () => {
		const id = new ObjectId();
		const products = {
			find: jest.fn().mockReturnValue(query([{ _id: id, productLikes: 3, productViews: 5 }])),
			findByIdAndUpdate: jest.fn(),
		};
		const members = {
			find: jest
				.fn()
				.mockReturnValue(
					query([{ _id: id, memberLikes: 4, memberViews: 3, memberProperties: 100, memberArticles: 100 }]),
				),
			findByIdAndUpdate: jest.fn(),
		};
		const service = new QuwatBatchService(products as any, members as any);
		await service.batchTopProducts();
		await service.batchTopAgents();
		expect(products.find).toHaveBeenCalledWith({ productStatus: ProductStatus.ACTIVE, productRank: 0 });
		expect(products.findByIdAndUpdate).toHaveBeenCalledWith(id, { productRank: 11 });
		expect(members.find).toHaveBeenCalledWith({
			memberType: MemberType.AGENT,
			memberStatus: MemberStatus.ACTIVE,
			memberRank: 0,
		});
		expect(members.findByIdAndUpdate).toHaveBeenCalledWith(id, { memberRank: 11 });
	});
	it('resets only active products and active agent rankings', async () => {
		const products = { updateMany: jest.fn().mockReturnValue(query({})) },
			members = { updateMany: jest.fn().mockReturnValue(query({})) };
		await new QuwatBatchService(products as any, members as any).batchRollback();
		expect(products.updateMany).toHaveBeenCalledWith({ productStatus: ProductStatus.ACTIVE }, { productRank: 0 });
		expect(members.updateMany).toHaveBeenCalledWith(
			{ memberStatus: MemberStatus.ACTIVE, memberType: MemberType.AGENT },
			{ memberRank: 0 },
		);
	});
});
