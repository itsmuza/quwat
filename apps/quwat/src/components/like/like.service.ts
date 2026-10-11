import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ObjectId } from 'bson';
import { Like, MeLiked } from '../../libs/dto/like/like';
import { LikeInput } from '../../libs/dto/like/like.input';
import { OrdinaryInquiry } from '../../libs/dto/product/product.input';
import { Products } from '../../libs/dto/product/product';
import { LikeGroup } from '../../libs/enums/like.enum';
import { ProductStatus } from '../../libs/enums/product.enum';
import { lookupAuthMemberLiked } from '../../libs/config';

@Injectable()
export class LikeService {
	constructor(@InjectModel('Like') private readonly likeModel: Model<Like>) {}
	async toggleLike(input: LikeInput): Promise<number> {
		const search = { memberId: input.memberId, likeRefId: input.likeRefId, likeGroup: input.likeGroup };
		const removed = await this.likeModel.findOneAndDelete(search).exec();
		if (removed) return -1;
		try {
			await this.likeModel.create(search);
			return 1;
		} catch (error) {
			if (error?.code === 11000) return 0; // A concurrent toggle already inserted this like.
			throw error;
		}
	}
	async checkLikeExistence(input: LikeInput): Promise<MeLiked[]> {
		const result = await this.likeModel
			.findOne({ memberId: input.memberId, likeRefId: input.likeRefId, likeGroup: input.likeGroup })
			.exec();
		return result ? [{ memberId: input.memberId, likeRefId: input.likeRefId, myFavorite: true }] : [];
	}
	async getFavoriteProducts(memberId: ObjectId, { page, limit }: OrdinaryInquiry): Promise<Products> {
		const data = await this.likeModel
			.aggregate<Products>([
				{ $match: { memberId, likeGroup: LikeGroup.PRODUCT } },
				{ $sort: { updatedAt: -1, _id: -1 } },
				{ $lookup: { from: 'products', localField: 'likeRefId', foreignField: '_id', as: 'product' } },
				{ $unwind: '$product' },
				{ $match: { 'product.productStatus': ProductStatus.ACTIVE } },
				{ $replaceRoot: { newRoot: '$product' } },
				{
					$facet: {
						list: [
							{ $skip: (page - 1) * limit },
							{ $limit: limit },
							lookupAuthMemberLiked(memberId, LikeGroup.PRODUCT),
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return data[0] ?? { list: [], metaCounter: [] };
	}
}
