import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	NotFoundException,
	ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { createHash } from 'crypto';
import { ObjectId } from 'bson';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { GuestLikeInput, GuestLikeResult } from '../../libs/dto/guest-like/guest-like';
import { LikeGroup } from '../../libs/enums/like.enum';
import { ProductStatus } from '../../libs/enums/product.enum';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
interface GuestLikeRecord {
	_id: ObjectId;
	guestKey: string;
	likeGroup: LikeGroup;
	likeRefId: ObjectId;
}
export interface GuestLikeContext {
	req?: { headers?: Record<string, string | string[] | undefined> };
	guestLikeIds?: Promise<Set<string>>;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function guestKeyOf(context: GuestLikeContext): string | null {
	const headers = context.req?.headers;
	// Guest identifiers are never member IDs or authentication credentials.
	if (headers?.authorization) return null;
	const value = headers?.['x-quwat-guest-id'];
	return typeof value === 'string' && uuid.test(value)
		? createHash('sha256').update(value.toLowerCase()).digest('hex')
		: null;
}
@Injectable()
export class GuestLikeService {
	private indexReady?: Promise<string>;
	constructor(
		@InjectModel('GuestLike') private readonly likes: Model<GuestLikeRecord>,
		@InjectModel('Product') private readonly products: Model<any>,
		@InjectModel('Member') private readonly members: Model<any>,
		@InjectConnection() private readonly connection: Connection,
	) {}
	async hasLike(context: GuestLikeContext, group: LikeGroup, id: string | ObjectId): Promise<boolean> {
		const guestKey = guestKeyOf(context);
		if (!guestKey) return false;
		// One lookup per GraphQL request, shared by all product/agent field resolvers.
		context.guestLikeIds ??= this.likes
			.find({ guestKey })
			.select('likeGroup likeRefId')
			.lean()
			.exec()
			.then((rows) => new Set(rows.map((row) => `${row.likeGroup}:${row.likeRefId}`)));
		return (await context.guestLikeIds).has(`${group}:${id}`);
	}
	async setLike(context: GuestLikeContext, input: GuestLikeInput): Promise<GuestLikeResult> {
		if (context.req?.headers?.authorization) throw new ForbiddenException('Guest likes are for anonymous visitors');
		const guestKey = guestKeyOf(context);
		if (!guestKey) throw new BadRequestException('Invalid guest identifier');
		const dto = plainToInstance(GuestLikeInput, input);
		if (!dto || validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length)
			throw new BadRequestException('Invalid guest like input');
		try {
			this.indexReady ??= this.likes.collection.createIndex(
				{ guestKey: 1, likeGroup: 1, likeRefId: 1 },
				{ unique: true },
			);
			await this.indexReady;
		} catch (error) {
			this.indexReady = undefined;
			throw error;
		}
		const likeRefId = new ObjectId(dto.likeRefId);
		const match = { guestKey, likeGroup: dto.likeGroup, likeRefId };
		const product = dto.likeGroup === LikeGroup.PRODUCT;
		const model = product ? this.products : this.members;
		const counter = product ? 'productLikes' : 'memberLikes';
		const targetMatch = product
			? { _id: likeRefId, productStatus: ProductStatus.ACTIVE }
			: { _id: likeRefId, memberStatus: MemberStatus.ACTIVE, memberType: MemberType.AGENT };
		for (let attempt = 0; ; attempt++) {
			try {
				const result = await this.connection.transaction(
					async (session) => {
						const target = await model.findOne(targetMatch).session(session).exec();
						if (!target) throw new NotFoundException(product ? 'Active product not found' : 'Active agent not found');
						const existing = await this.likes.findOne(match).session(session).exec();
						let modifier = 0;
						if (dto.liked && !existing) {
							await this.likes.create([match], { session });
							modifier = 1;
						} else if (!dto.liked && existing) {
							await this.likes.deleteOne({ _id: existing._id }).session(session).exec();
							modifier = -1;
						}
						if (modifier) {
							const updated = await model
								.findOneAndUpdate(
									{ ...targetMatch, ...(modifier < 0 ? { [counter]: { $gte: 1 } } : {}) },
									{ $inc: { [counter]: modifier } },
									{ new: true, session },
								)
								.exec();
							if (!updated) throw new BadRequestException('Guest like counter could not be updated');
							return {
								likeRefId: dto.likeRefId,
								likeGroup: dto.likeGroup,
								liked: dto.liked,
								likeCount: updated[counter],
							};
						}
						return { likeRefId: dto.likeRefId, likeGroup: dto.likeGroup, liked: dto.liked, likeCount: target[counter] };
					},
					{ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' },
				);
				// A batched operation may query guestLiked after this mutation on the same context.
				delete context.guestLikeIds;
				return result;
			} catch (error) {
				if (error?.code === 11000 && attempt < 2) continue;
				if (error?.code === 20 || /transaction numbers.*replica set/i.test(error?.message || ''))
					throw new ServiceUnavailableException('Guest likes require MongoDB transaction support');
				throw error;
			}
		}
	}
}
