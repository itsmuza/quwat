import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model } from 'mongoose';
import { ObjectId } from 'bson';
import { Product } from '../../libs/dto/product/product';
import { Member } from '../../libs/dto/member/member';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { SaleStatus } from '../../libs/enums/sale.enum';
import { CommentStatus } from '../../libs/enums/comment.enum';

@Injectable()
export class AdminDeletionService {
	constructor(
		@InjectModel('Product') private readonly products: Model<Product>,
		@InjectModel('Member') private readonly members: Model<Member>,
		@InjectModel('Like') private readonly likes: Model<any>,
		@InjectModel('View') private readonly views: Model<any>,
		@InjectModel('Comment') private readonly comments: Model<any>,
		@InjectModel('GuestLike') private readonly guestLikes: Model<any>,
		@InjectModel('SavedProduct') private readonly saved: Model<any>,
		@InjectModel('Sale') private readonly sales: Model<any>,
		@InjectModel('SaleNotificationRead') private readonly reads: Model<any>,
		@InjectConnection() private readonly connection: Connection,
	) {}
	private authorize(admin: Member, id: string): ObjectId {
		if (!admin || admin.memberType !== MemberType.ADMIN || admin.memberStatus !== MemberStatus.ACTIVE)
			throw new ForbiddenException('Only active admins can permanently delete records');
		if (!/^[a-f0-9]{24}$/i.test(id)) throw new BadRequestException('Invalid deletion target');
		return new ObjectId(id);
	}
	private async transaction(work: (session: ClientSession) => Promise<boolean>): Promise<boolean> {
		try {
			return await this.connection.transaction(work, {
				readConcern: { level: 'snapshot' },
				writeConcern: { w: 'majority' },
				readPreference: 'primary',
			});
		} catch (error) {
			if (error?.code === 20 || /transaction numbers.*replica set/i.test(error?.message || ''))
				throw new ServiceUnavailableException('Permanent deletion requires a MongoDB replica set');
			throw error;
		}
	}
	// Delete social rows together with their counters, leaving receipts/attendance untouched.
	private async social(group: 'PRODUCT' | 'MEMBER', id: ObjectId, session: ClientSession, author = false) {
		for (const [model, prefix, reference, suffix] of [
			[this.likes, 'like', 'likeRefId', 'Likes'],
			[this.views, 'view', 'viewRefId', 'Views'],
			[this.comments, 'comment', 'commentRefId', 'Comments'],
		] as const) {
			const target = { [reference]: id, [`${prefix}Group`]: group };
			const match = author ? { $or: [target, { memberId: id }] } : target;
			if (author) {
				const rows = await model.find(match).session(session).lean().exec();
				for (const row of rows) {
					const targetGroup = row[`${prefix}Group`];
					if (targetGroup === group && String(row[reference]) === String(id)) continue;
					if (prefix === 'comment' && row.commentStatus !== CommentStatus.ACTIVE) continue;
					if (targetGroup !== 'PRODUCT' && targetGroup !== 'MEMBER') continue;
					const product = targetGroup === 'PRODUCT';
					const field = `${product ? 'product' : 'member'}${suffix}`;
					await ((product ? this.products : this.members) as Model<any>)
						.updateOne(
							{ _id: row[reference] },
							[{ $set: { [field]: { $max: [0, { $subtract: [{ $ifNull: [`$${field}`, 0] }, 1] }] } } }],
							{ session },
						)
						.exec();
				}
			}
			await model.deleteMany(match, { session }).exec();
		}
		await this.guestLikes.deleteMany({ likeRefId: id, likeGroup: group }, { session }).exec();
	}
	async deleteProduct(admin: Member, rawId: string): Promise<boolean> {
		const id = this.authorize(admin, rawId);
		return this.transaction(async (session) => {
			const current = await this.products.findById(id).session(session).lean().exec();
			if (!current) return true;
			if (
				current.productReservedQuantity !== 0 ||
				(await this.sales.exists({ saleStatus: SaleStatus.PENDING, 'items.productId': id }).session(session).exec())
			)
				throw new ConflictException('Product has pending sales or reserved stock');
			const removed = await this.products.deleteOne({ _id: id, productReservedQuantity: 0 }, { session }).exec();
			if (removed.deletedCount !== 1) throw new ConflictException('Product changed concurrently; reload and retry');
			await this.social('PRODUCT', id, session);
			await this.saved.deleteMany({ productId: id }, { session }).exec();
			return true;
		});
	}
	async deleteMember(admin: Member, rawId: string): Promise<boolean> {
		const id = this.authorize(admin, rawId);
		if (String(admin._id) === String(id)) throw new ForbiddenException('Administrators cannot delete themselves');
		return this.transaction(async (session) => {
			const member = await this.members.findById(id).session(session).lean().exec();
			if (!member) return true;
			if (member.memberType === MemberType.ADMIN)
				throw new ForbiddenException('Administrator accounts cannot be permanently deleted');
			const removed = await this.members
				.deleteOne({ _id: id, memberType: { $ne: MemberType.ADMIN } }, { session })
				.exec();
			if (removed.deletedCount !== 1) throw new ConflictException('Member changed concurrently; reload and retry');
			await this.social('MEMBER', id, session, true);
			await this.saved.deleteMany({ memberId: id }, { session }).exec();
			await this.reads.deleteMany({ agentId: id }, { session }).exec();
			// Sales keep immutable names/items; attendance retains memberId for historical admin queries.
			return true;
		});
	}
}
