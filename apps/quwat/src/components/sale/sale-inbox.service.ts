import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Sale, SaleNotifications } from '../../libs/dto/sale/sale';
import { SaleIdInput } from '../../libs/dto/sale/sale.input';
import { OrdinaryInquiry } from '../../libs/dto/product/product.input';
import { Member } from '../../libs/dto/member/member';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { SaleStatus } from '../../libs/enums/sale.enum';
import { SaleNotificationRead } from '../../libs/schemas/SaleNotificationRead.model';
import { shapeIntoMongoObject } from '../../libs/config';

function checked<T extends object>(type: new () => T, input: T): T {
	const dto = plainToInstance(type, input);
	if (!dto || validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length)
		throw new BadRequestException('Invalid sale input');
	return dto;
}

@Injectable()
export class SaleInboxService {
	private indexReady?: Promise<string>;
	constructor(
		@InjectModel('Sale') private readonly sales: Model<Sale>,
		@InjectModel('SaleNotificationRead') private readonly reads: Model<SaleNotificationRead>,
	) {}
	private agent(member: Member) {
		if (!member || member.memberType !== MemberType.AGENT || member.memberStatus !== MemberStatus.ACTIVE)
			throw new ForbiddenException('Only active agents may read sale notifications');
	}
	async getSaleNotifications(member: Member, raw: OrdinaryInquiry): Promise<SaleNotifications> {
		this.agent(member);
		const input = checked(OrdinaryInquiry, raw);
		// The persisted sale is the notification source, so offline agents miss no requests.
		// Only actionable pending requests belong in the inbox; history keeps final sales.
		const [result] = await this.sales
			.aggregate([
				{ $match: { saleStatus: SaleStatus.PENDING } },
				{ $sort: { createdAt: -1, _id: -1 } },
				{
					$lookup: {
						from: this.reads.collection.name,
						let: { saleId: '$_id' },
						pipeline: [
							{
								$match: {
									$expr: {
										$and: [{ $eq: ['$saleId', '$$saleId'] }, { $eq: ['$agentId', shapeIntoMongoObject(member._id)] }],
									},
								},
							},
							{ $project: { _id: 0, readAt: 1 } },
						],
						as: 'notificationRead',
					},
				},
				{
					$set: {
						sale: '$$ROOT',
						readAt: { $ifNull: [{ $arrayElemAt: ['$notificationRead.readAt', 0] }, null] },
					},
				},
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							{ $project: { _id: 0, sale: 1, readAt: 1 } },
						],
						metaCounter: [{ $count: 'total' }],
						unreadCounter: [{ $match: { readAt: null } }, { $count: 'total' }],
					},
				},
			])
			.exec();
		return {
			list: result?.list || [],
			metaCounter: result?.metaCounter || [],
			unreadCount: result?.unreadCounter?.[0]?.total || 0,
		};
	}
	async markSaleNotificationRead(member: Member, raw: SaleIdInput): Promise<boolean> {
		this.agent(member);
		const input = checked(SaleIdInput, raw);
		const filter = { agentId: shapeIntoMongoObject(member._id), saleId: shapeIntoMongoObject(input._id) };
		if (!(await this.sales.exists({ _id: filter.saleId }).exec()))
			throw new NotFoundException('Sale request not found');
		try {
			this.indexReady ??= this.reads.collection.createIndex({ agentId: 1, saleId: 1 }, { unique: true });
			await this.indexReady;
		} catch (error) {
			this.indexReady = undefined;
			throw error;
		}
		try {
			await this.reads.updateOne(filter, { $setOnInsert: { ...filter, readAt: new Date() } }, { upsert: true }).exec();
		} catch (error) {
			if (error?.code !== 11000 || !(await this.reads.exists(filter).exec())) throw error;
		}
		return true;
	}
	async getSaleForAgent(member: Member, raw: SaleIdInput): Promise<Sale> {
		this.agent(member);
		const input = checked(SaleIdInput, raw);
		const sale = await this.sales
			.findOne({ _id: shapeIntoMongoObject(input._id) })
			.lean()
			.exec();
		if (!sale) throw new NotFoundException('Sale request not found');
		return sale;
	}
}
