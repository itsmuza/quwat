import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ObjectId } from 'bson';
import { Model } from 'mongoose';
import { isMongoId, validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { Member } from '../../libs/dto/member/member';
import { Product, Products } from '../../libs/dto/product/product';
import { OrdinaryInquiry } from '../../libs/dto/product/product.input';
import type { SavedProduct } from '../../libs/dto/saved-product/saved-product';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { ProductStatus } from '../../libs/enums/product.enum';
import { LikeGroup } from '../../libs/enums/like.enum';
import { lookupAuthMemberLiked, shapeIntoMongoObject } from '../../libs/config';

@Injectable()
export class SavedProductService {
	private uniqueIndexReady?: Promise<string>;
	constructor(
		@InjectModel('SavedProduct') private readonly savedModel: Model<SavedProduct>,
		@InjectModel('Product') private readonly productModel: Model<Product>,
	) {}
	private isClient(member: Member | null): member is Member {
		return !!member && member.memberType === MemberType.CLIENT && member.memberStatus === MemberStatus.ACTIVE;
	}
	private assertClient(member: Member | null): asserts member is Member {
		if (!this.isClient(member)) throw new ForbiddenException('Only active clients can manage saved products');
	}
	private productId(value: string): ObjectId {
		if (typeof value !== 'string' || !isMongoId(value)) throw new BadRequestException('Invalid productId');
		return new ObjectId(value);
	}
	private async ensureUniqueIndex(): Promise<void> {
		try {
			this.uniqueIndexReady ??= this.savedModel.collection.createIndex({ memberId: 1, productId: 1 }, { unique: true });
			await this.uniqueIndexReady;
		} catch (error) {
			this.uniqueIndexReady = undefined;
			throw error;
		}
	}
	async saveProduct(member: Member, id: string): Promise<boolean> {
		this.assertClient(member);
		const productId = this.productId(id);
		const product = await this.productModel.exists({ _id: productId, productStatus: ProductStatus.ACTIVE }).exec();
		if (!product) throw new NotFoundException('Active product not found');
		await this.ensureUniqueIndex();
		const filter = { memberId: shapeIntoMongoObject(member._id), productId };
		const now = new Date();
		try {
			await this.savedModel
				.updateOne(
					filter,
					{ $setOnInsert: { ...filter, createdAt: now, updatedAt: now } },
					{ upsert: true, runValidators: true, timestamps: false },
				)
				.exec();
		} catch (error) {
			if (error?.code !== 11000 || !(await this.savedModel.exists(filter).exec())) throw error;
		}
		return true;
	}
	async unsaveProduct(member: Member, id: string): Promise<boolean> {
		this.assertClient(member);
		await this.savedModel
			.deleteOne({ memberId: shapeIntoMongoObject(member._id), productId: this.productId(id) })
			.exec();
		return true;
	}
	async getSavedProducts(member: Member, input: OrdinaryInquiry): Promise<Products> {
		this.assertClient(member);
		const dto = plainToInstance(OrdinaryInquiry, input);
		if (validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length)
			throw new BadRequestException('Invalid saved products input');
		const memberId = shapeIntoMongoObject(member._id);
		const data = await this.savedModel
			.aggregate<Products>([
				{ $match: { memberId } },
				{ $sort: { createdAt: -1, _id: -1 } },
				{ $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
				{ $unwind: '$product' },
				{ $match: { 'product.productStatus': { $in: [ProductStatus.ACTIVE, ProductStatus.ARCHIVED] } } },
				{ $replaceRoot: { newRoot: '$product' } },
				{
					$facet: {
						list: [
							{ $skip: (dto.page - 1) * dto.limit },
							{ $limit: dto.limit },
							lookupAuthMemberLiked(memberId, LikeGroup.PRODUCT),
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return data[0] ?? { list: [], metaCounter: [] };
	}
	async isSaved(member: Member | null, productId: ObjectId): Promise<boolean> {
		if (!this.isClient(member)) return false;
		return !!(await this.savedModel.exists({ memberId: shapeIntoMongoObject(member._id), productId }).exec());
	}
}
