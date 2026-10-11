import 'reflect-metadata';
import { ObjectId } from 'bson';
import { LikeService } from '../like/like.service';
import { ViewService } from '../view/view.service';
import { CommentService } from '../comment/comment.service';
import { LikeGroup } from '../../libs/enums/like.enum';
import { ViewGroup } from '../../libs/enums/view.enum';
import { CommentGroup, CommentStatus } from '../../libs/enums/comment.enum';
import LikeSchema from '../../libs/schemas/Like.model';
import ViewSchema from '../../libs/schemas/View.model';

const query = (value: unknown): any => ({ exec: jest.fn().mockResolvedValue(value) });
const memberId = new ObjectId(),
	refId = new ObjectId();

describe('Product/member social interactions', () => {
	it('likes are distinct by group and toggling a product does not toggle a member like', async () => {
		const db = {
			findOneAndDelete: jest.fn().mockReturnValue(query(null)),
			create: jest.fn().mockResolvedValue({}),
			findOne: jest.fn().mockReturnValue(query({})),
		};
		const service = new LikeService(db as any);
		const input = { memberId, likeRefId: refId, likeGroup: LikeGroup.PRODUCT };
		expect(await service.toggleLike(input)).toBe(1);
		expect(db.findOneAndDelete).toHaveBeenCalledWith(input);
		await service.checkLikeExistence(input);
		expect(db.findOne).toHaveBeenCalledWith(input);
		db.findOneAndDelete.mockReturnValue(query({}));
		expect(await service.toggleLike(input)).toBe(-1);
		expect(LikeSchema.indexes()[0][0]).toEqual({ memberId: 1, likeRefId: 1, likeGroup: 1 });
	});
	it('duplicate concurrent likes cannot double-increment the counter', async () => {
		const db = {
			findOneAndDelete: jest.fn().mockReturnValue(query(null)),
			create: jest.fn().mockRejectedValue({ code: 11000 }),
		};
		expect(
			await new LikeService(db as any).toggleLike({ memberId, likeRefId: refId, likeGroup: LikeGroup.PRODUCT }),
		).toBe(0);
	});
	it('views are distinct by group and duplicate requests are counted once', async () => {
		const db = { findOne: jest.fn().mockReturnValue(query(null)), create: jest.fn().mockResolvedValue({}) };
		const service = new ViewService(db as any),
			input = { memberId, viewRefId: refId, viewGroup: ViewGroup.PRODUCT };
		await service.recordView(input);
		expect(db.findOne).toHaveBeenCalledWith(input);
		db.findOne.mockReturnValue(query({}));
		expect(await service.recordView(input)).toBeNull();
		db.findOne.mockReturnValue(query(null));
		db.create.mockRejectedValue({ code: 11000 });
		expect(await service.recordView(input)).toBeNull();
		expect(ViewSchema.indexes()[0][0]).toEqual({ memberId: 1, viewRefId: 1, viewGroup: 1 });
	});
	it.each(['favorites', 'visited'])(
		'%s exclude archived/draft cards before pagination and counting and return products without owners',
		async (kind) => {
			const result = { list: [{ productName: 'Bolga' }], metaCounter: [{ total: 1 }] };
			const db = { aggregate: jest.fn().mockReturnValue(query([result])) };
			const actual =
				kind === 'favorites'
					? await new LikeService(db as any).getFavoriteProducts(memberId, { page: 2, limit: 10 })
					: await new ViewService(db as any).getVisitedProducts(memberId, { page: 2, limit: 10 });
			expect(actual).toEqual(result);
			const pipeline = db.aggregate.mock.calls[0][0];
			expect(pipeline[2].$lookup.from).toBe('products');
			const activeFilter = pipeline.findIndex((stage) => stage.$match?.['product.productStatus'] === 'ACTIVE');
			const facet = pipeline.findIndex((stage) => stage.$facet);
			expect(activeFilter).toBeLessThan(facet);
			expect(activeFilter).toBeGreaterThan(0);
			expect(pipeline[facet].$facet.list[0]).toEqual({ $skip: 10 });
			expect(JSON.stringify(pipeline)).not.toContain('members');
		},
	);
	it('retains product comments and the author identity, with product-specific counters', async () => {
		const product = { requireActiveProduct: jest.fn().mockResolvedValue({}), productStatsEditor: jest.fn() };
		const members = { memberStatsEditor: jest.fn() };
		const db = {
			create: jest.fn(async (input) => input),
			findByIdAndDelete: jest
				.fn()
				.mockReturnValue(
					query({ commentGroup: CommentGroup.PRODUCT, commentRefId: refId, commentStatus: CommentStatus.ACTIVE }),
				),
		};
		const service = new CommentService(db as any, members as any, product as any);
		const result = await service.createComment(memberId, {
			commentGroup: CommentGroup.PRODUCT,
			commentContent: 'Good',
			commentRefId: refId,
		});
		expect(result.memberId).toBe(memberId);
		expect(product.requireActiveProduct).toHaveBeenCalledWith(refId);
		expect(product.productStatsEditor).toHaveBeenCalledWith({ _id: refId, targetKey: 'productComments', modifier: 1 });
		await service.removeCommentByAdmin(refId);
		expect(product.productStatsEditor).toHaveBeenLastCalledWith({
			_id: refId,
			targetKey: 'productComments',
			modifier: -1,
		});
		expect(members.memberStatsEditor).not.toHaveBeenCalled();
	});
	it('rejects a comment on a non-active product before insertion', async () => {
		const db = { create: jest.fn() },
			product = { requireActiveProduct: jest.fn().mockRejectedValue(new Error('Active product not found')) };
		const service = new CommentService(db as any, {} as any, product as any);
		await expect(
			service.createComment(memberId, {
				commentGroup: CommentGroup.PRODUCT,
				commentContent: 'Good',
				commentRefId: refId,
			}),
		).rejects.toThrow();
		expect(db.create).not.toHaveBeenCalled();
	});
	it('keeps member comments independent from product comments', async () => {
		const members = { memberStatsEditor: jest.fn() },
			product = { requireActiveProduct: jest.fn(), productStatsEditor: jest.fn() };
		const db = { create: jest.fn(async (input) => input) };
		await new CommentService(db as any, members as any, product as any).createComment(memberId, {
			commentGroup: CommentGroup.MEMBER,
			commentContent: 'Good',
			commentRefId: refId,
		});
		expect(members.memberStatsEditor).toHaveBeenCalledWith({ _id: refId, targetKey: 'memberComments', modifier: 1 });
		expect(product.productStatsEditor).not.toHaveBeenCalled();
	});
});

describe('Active comment counter deletion', () => {
	it('decrements on soft deletion and does not decrement again when admin removes the deleted comment', async () => {
		const deleted = { commentGroup: CommentGroup.PRODUCT, commentRefId: refId, commentStatus: CommentStatus.DELETE };
		const db = {
			findOneAndUpdate: jest.fn().mockReturnValue(query(deleted)),
			findByIdAndDelete: jest.fn().mockReturnValue(query(deleted)),
		};
		const product = { productStatsEditor: jest.fn() };
		const service = new CommentService(db as any, {} as any, product as any);
		await service.updateComment(memberId, { _id: refId, commentStatus: CommentStatus.DELETE });
		expect(product.productStatsEditor).toHaveBeenCalledWith({ _id: refId, targetKey: 'productComments', modifier: -1 });
		await service.removeCommentByAdmin(refId);
		expect(product.productStatsEditor).toHaveBeenCalledTimes(1);
	});
	it('uses group when reading comments and still joins their member authors', async () => {
		const db = { aggregate: jest.fn().mockReturnValue(query([{ list: [], metaCounter: [] }])) };
		const service = new CommentService(db as any, {} as any, {} as any);
		await service.getComments(memberId, {
			page: 1,
			limit: 10,
			search: { commentGroup: CommentGroup.PRODUCT, commentRefId: refId },
		});
		const pipeline = db.aggregate.mock.calls[0][0];
		expect(pipeline[0].$match).toMatchObject({ commentGroup: CommentGroup.PRODUCT, commentRefId: refId });
		expect(pipeline[2].$facet.list.find((stage) => stage.$lookup).$lookup.from).toBe('members');
	});
});
