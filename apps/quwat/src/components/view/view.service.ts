import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ObjectId } from 'bson';
import { View } from '../../libs/dto/view/view';
import { ViewInput } from '../../libs/dto/view/view.input';
import { OrdinaryInquiry } from '../../libs/dto/product/product.input';
import { Products } from '../../libs/dto/product/product';
import { ViewGroup } from '../../libs/enums/view.enum';
import { ProductStatus } from '../../libs/enums/product.enum';
import { LikeGroup } from '../../libs/enums/like.enum';
import { lookupAuthMemberLiked } from '../../libs/config';

@Injectable()
export class ViewService {
	constructor(@InjectModel('View') private readonly viewModel: Model<View>) {}
	async recordView(input: ViewInput): Promise<View | null> {
		const search = { memberId: input.memberId, viewRefId: input.viewRefId, viewGroup: input.viewGroup };
		if (await this.viewModel.findOne(search).exec()) return null;
		try {
			return await this.viewModel.create(search);
		} catch (error) {
			if (error?.code === 11000) return null;
			throw error;
		}
	}
	async getVisitedProducts(memberId: ObjectId, { page, limit }: OrdinaryInquiry): Promise<Products> {
		const data = await this.viewModel
			.aggregate<Products>([
				{ $match: { memberId, viewGroup: ViewGroup.PRODUCT } },
				{ $sort: { updatedAt: -1, _id: -1 } },
				{ $lookup: { from: 'products', localField: 'viewRefId', foreignField: '_id', as: 'product' } },
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
