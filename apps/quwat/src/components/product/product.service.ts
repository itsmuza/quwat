import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ObjectId } from 'bson';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Product, Products } from '../../libs/dto/product/product';
import {
	AllProductsInquiry,
	OrdinaryInquiry,
	ProductInput,
	ProductsInquiry,
	ProductSearch,
	ProductUpdate,
} from '../../libs/dto/product/product.input';
import { ProductStatus } from '../../libs/enums/product.enum';
import { Member } from '../../libs/dto/member/member';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { Direction } from '../../libs/enums/common.enum';
import { LikeGroup } from '../../libs/enums/like.enum';
import { ViewGroup } from '../../libs/enums/view.enum';
import { StatisticModifier } from '../../libs/types/common';
import { lookupAuthMemberLiked } from '../../libs/config';
import {
	defaultQuantityStep,
	isQuantity,
	isWholeUnit,
	validQuantityRules,
} from '../../libs/validation/product-quantity';
import { LikeService } from '../like/like.service';
import { ViewService } from '../view/view.service';

const editableFields = [
	'productName',
	'productType',
	'productStatus',
	'productUnit',
	'productPrice',
	'productBrand',
	'productDesc',
	'productImages',
	'productQuantity',
	'productMinOrderQuantity',
	'productQuantityStep',
] as const;
function checked<T extends object>(type: new () => T, input: T): T {
	const value = plainToInstance(type, input);
	if (validateSync(value, { whitelist: true, forbidNonWhitelisted: true }).length)
		throw new BadRequestException('Invalid product input');
	return value;
}

@Injectable()
export class ProductService {
	private nameIndexReady?: Promise<string>;
	constructor(
		@InjectModel('Product') private readonly productModel: Model<Product>,
		private readonly likeService: LikeService,
		private readonly viewService: ViewService,
	) {}
	private assertAdmin(admin: Member): void {
		if (!admin || admin.memberType !== MemberType.ADMIN || admin.memberStatus !== MemberStatus.ACTIVE)
			throw new ForbiddenException('Only active admins can manage products');
	}
	private changes(input: ProductInput): Record<string, any> {
		const data: Record<string, any> = {};
		for (const key of editableFields) if (input[key] != null) data[key] = input[key];
		return data;
	}
	private validateRules(data: ProductInput): void {
		if (!validQuantityRules(data.productUnit, data.productMinOrderQuantity!, data.productQuantityStep!))
			throw new BadRequestException('Invalid minimum quantity or quantity step for unit');
	}
	private validateStock(unit: ProductInput['productUnit'], quantity: number, reserved: number): void {
		if (!isQuantity(quantity) || (isWholeUnit(unit) && !Number.isInteger(quantity)))
			throw new BadRequestException('Invalid stock quantity for unit');
		if (quantity < reserved) throw new BadRequestException('Stock quantity cannot be below reserved quantity');
	}
	private async ensureUniqueNameIndex(): Promise<void> {
		try {
			// Await the unique index before saving names, including when automatic indexing is disabled.
			this.nameIndexReady ??= this.productModel.collection.createIndex({ productName: 1 }, { unique: true });
			await this.nameIndexReady;
		} catch (error) {
			this.nameIndexReady = undefined;
			if (error?.code === 11000)
				throw new ConflictException(
					'Duplicate product names already exist in the database; resolve them before saving products',
				);
			throw error;
		}
	}
	private nameConflict(error: unknown): never {
		if ((error as { code?: number })?.code === 11000)
			throw new ConflictException('A product with this name already exists');
		throw error;
	}
	async createProduct(admin: Member, input: ProductInput): Promise<Product> {
		this.assertAdmin(admin);
		const data = this.changes(checked(ProductInput, input));
		data.productStatus ??= ProductStatus.DRAFT;
		data.productImages ??= [];
		data.productQuantity ??= 0;
		data.productMinOrderQuantity ??= defaultQuantityStep(data.productUnit);
		data.productQuantityStep ??= defaultQuantityStep(data.productUnit);
		this.validateRules(data as ProductInput);
		this.validateStock(data.productUnit, data.productQuantity, 0);
		await this.ensureUniqueNameIndex();
		try {
			return await this.productModel.create({
				...data,
				productQuantity: data.productQuantity,
				productReservedQuantity: 0,
				archivedAt: data.productStatus === ProductStatus.ARCHIVED ? new Date() : null,
			});
		} catch (error) {
			this.nameConflict(error);
		}
	}
	async updateProduct(admin: Member, input: ProductUpdate): Promise<Product> {
		this.assertAdmin(admin);
		const dto = checked(ProductUpdate, input);
		const current = await this.productModel.findById(dto._id).lean().exec();
		if (!current) throw new NotFoundException('Product not found');
		if (dto.productQuantity !== undefined) {
			if (dto.expectedProductQuantity == null) throw new BadRequestException('Stock update requires expected quantity');
			if (dto.expectedProductQuantity !== current.productQuantity)
				throw new BadRequestException('Product changed concurrently; reload and retry');
		}
		const data = this.changes(dto as ProductInput);
		if (data.productUnit && data.productUnit !== current.productUnit) {
			if (current.productQuantity !== 0 || current.productReservedQuantity !== 0)
				throw new BadRequestException('Unit cannot change while stock or reservations exist');
			data.productMinOrderQuantity ??= defaultQuantityStep(data.productUnit);
			data.productQuantityStep ??= defaultQuantityStep(data.productUnit);
		}
		// Validate the resulting card, not only the optional update fields.
		const card = Object.fromEntries(
			editableFields.map((key) => [key, data[key] ?? current[key]]),
		) as unknown as ProductInput;
		checked(ProductInput, card);
		this.validateRules(card);
		this.validateStock(card.productUnit, card.productQuantity!, current.productReservedQuantity);
		const status = data.productStatus ?? current.productStatus;
		data.archivedAt = status === ProductStatus.ARCHIVED ? (current.archivedAt ?? new Date()) : null;
		if (data.productName !== undefined) await this.ensureUniqueNameIndex();
		let result: Product | null;
		try {
			result = await this.productModel
				.findOneAndUpdate(
					{
						_id: dto._id,
						productUnit: current.productUnit,
						productQuantity: current.productQuantity,
						productReservedQuantity: current.productReservedQuantity,
						productMinOrderQuantity: current.productMinOrderQuantity,
						productQuantityStep: current.productQuantityStep,
						productStatus: current.productStatus,
					},
					{ $set: data },
					{ new: true, runValidators: true },
				)
				.exec();
		} catch (error) {
			this.nameConflict(error);
		}
		if (!result) throw new BadRequestException('Product changed concurrently; reload and retry');
		return result;
	}
	async removeProductByAdmin(admin: Member, productId: ObjectId): Promise<Product> {
		this.assertAdmin(admin);
		const result = await this.productModel
			.findOneAndUpdate(
				{ _id: productId, productStatus: { $ne: ProductStatus.ARCHIVED } },
				{
					$set: {
						productStatus: ProductStatus.ARCHIVED,
						archivedAt: new Date(),
					},
				},
				{ new: true, runValidators: true },
			)
			.exec();
		if (result) return result;
		const archived = await this.productModel.findById(productId).exec();
		if (!archived) throw new NotFoundException('Product not found');
		return archived;
	}
	async requireActiveProduct(productId: ObjectId): Promise<Product> {
		const product = await this.productModel
			.findOne({ _id: productId, productStatus: ProductStatus.ACTIVE })
			.lean()
			.exec();
		if (!product) throw new NotFoundException('Active product not found');
		return product;
	}
	async getProduct(memberId: ObjectId | null, productId: ObjectId): Promise<Product> {
		const product = await this.requireActiveProduct(productId);
		if (memberId) {
			const recorded = await this.viewService.recordView({
				memberId,
				viewRefId: productId,
				viewGroup: ViewGroup.PRODUCT,
			});
			if (recorded) {
				await this.productStatsEditor({
					_id: productId,
					targetKey: 'productViews',
					modifier: 1,
				});
				product.productViews++;
			}
			product.meLiked = await this.likeService.checkLikeExistence({
				memberId,
				likeRefId: productId,
				likeGroup: LikeGroup.PRODUCT,
			});
		}
		return product;
	}
	private match(search: ProductSearch): Record<string, any> {
		const match: Record<string, any> = {};
		if (search.typeList?.length) match.productType = { $in: search.typeList };
		if (search.unitList?.length) match.productUnit = { $in: search.unitList };
		if (search.brandList?.length) match.productBrand = { $in: search.brandList };
		for (const [filter, field] of [
			['pricesRange', 'productPrice'],
			['periodsRange', 'createdAt'],
		] as const) {
			const range = search[filter];
			if (!range) continue;
			if (range.start != null && range.end != null && range.start > range.end)
				throw new BadRequestException('Invalid search range');
			const bounds: Record<string, unknown> = {};
			if (range.start != null) bounds.$gte = range.start;
			if (range.end != null) bounds.$lte = range.end;
			if (Object.keys(bounds).length) match[field] = bounds;
		}
		if (search.text)
			match.productName = {
				$regex: search.text.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
				$options: 'i',
			};
		if (search.inStock != null)
			match.$expr = {
				[search.inStock ? '$gt' : '$lte']: [{ $subtract: ['$productQuantity', '$productReservedQuantity'] }, 0],
			};
		return match;
	}
	private async list(
		memberId: ObjectId | null,
		input: ProductsInquiry | AllProductsInquiry,
		match: Record<string, any>,
	): Promise<Products> {
		const result = await this.productModel
			.aggregate<Products>([
				{ $match: match },
				{
					$sort: {
						[input.sort ?? 'createdAt']: input.direction ?? Direction.DESC,
						_id: -1,
					},
				},
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							lookupAuthMemberLiked(memberId, LikeGroup.PRODUCT),
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return result[0] ?? { list: [], metaCounter: [] };
	}
	async getProducts(memberId: ObjectId | null, input: ProductsInquiry): Promise<Products> {
		const dto = checked(ProductsInquiry, input);
		return this.list(memberId, dto, {
			...this.match(dto.search),
			productStatus: ProductStatus.ACTIVE,
		});
	}
	async getAllProductsByAdmin(admin: Member, input: AllProductsInquiry): Promise<Products> {
		this.assertAdmin(admin);
		const dto = checked(AllProductsInquiry, input);
		const match = this.match(dto.search);
		if (dto.search.productStatus) match.productStatus = dto.search.productStatus;
		return this.list(null, dto, match);
	}
	async getFavorites(memberId: ObjectId, input: OrdinaryInquiry): Promise<Products> {
		return this.likeService.getFavoriteProducts(memberId, checked(OrdinaryInquiry, input));
	}
	async getVisited(memberId: ObjectId, input: OrdinaryInquiry): Promise<Products> {
		return this.viewService.getVisitedProducts(memberId, checked(OrdinaryInquiry, input));
	}
	async likeTargetProduct(memberId: ObjectId, productId: ObjectId): Promise<Product> {
		await this.requireActiveProduct(productId);
		const modifier = await this.likeService.toggleLike({
			memberId,
			likeRefId: productId,
			likeGroup: LikeGroup.PRODUCT,
		});
		const product = await this.productStatsEditor({
			_id: productId,
			targetKey: 'productLikes',
			modifier,
		});
		product.meLiked = await this.likeService.checkLikeExistence({
			memberId,
			likeRefId: productId,
			likeGroup: LikeGroup.PRODUCT,
		});
		return product;
	}
	async productStatsEditor({ _id, targetKey, modifier }: StatisticModifier): Promise<Product> {
		if (!['productLikes', 'productViews', 'productComments'].includes(targetKey))
			throw new BadRequestException('Invalid product counter');
		const result = await this.productModel
			.findByIdAndUpdate(_id, { $inc: { [targetKey]: modifier } }, { new: true })
			.exec();
		if (!result) throw new NotFoundException('Product not found');
		return result;
	}
}
