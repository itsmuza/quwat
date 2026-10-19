import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
	Optional,
	ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model } from 'mongoose';
import { createHash } from 'crypto';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Sale, SaleLine, Sales, DailySalesReport } from '../../libs/dto/sale/sale';
import {
	AdminSalesInquiry,
	DailySalesInput,
	RequestSaleInput,
	SaleIdInput,
	SalesInquiry,
} from '../../libs/dto/sale/sale.input';
import { OrdinaryInquiry } from '../../libs/dto/product/product.input';
import { Product } from '../../libs/dto/product/product';
import { Member } from '../../libs/dto/member/member';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { ProductStatus } from '../../libs/enums/product.enum';
import { SaleStatus } from '../../libs/enums/sale.enum';
import { isQuantity, isWholeUnit } from '../../libs/validation/product-quantity';
import { attendanceToday } from '../../libs/validation/attendance-date';
import { isWholeSom } from '../../libs/scalars/whole-som.scalar';
import { shapeIntoMongoObject } from '../../libs/config';
import { SocketGateway } from '../../socket/socket.gateway';
function checked<T extends object>(type: new () => T, input: T): T {
	const dto = plainToInstance(type, input);
	if (!dto || validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length)
		throw new BadRequestException('Invalid sale input');
	return dto;
}
export function saleLineAmount(price: number, quantity: number): number {
	if (!isWholeSom(price) || !isQuantity(quantity) || quantity <= 0)
		throw new BadRequestException('Invalid sale amount');
	const value = (BigInt(price) * BigInt(Math.round(quantity * 1000)) + BigInt(500)) / BigInt(1000);
	if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new BadRequestException('Sale amount exceeds safe integer range');
	return Number(value);
}
export const saleRequestHash = (input: RequestSaleInput) =>
	createHash('sha256')
		.update(
			JSON.stringify({
				paymentMethod: input.paymentMethod,
				expectedTotal: input.expectedTotal,
				items: [...input.items]
					.sort((a, b) => a.productId.localeCompare(b.productId))
					.map((i) => ({
						productId: i.productId,
						quantity: i.quantity,
						expectedUnitPrice: i.expectedUnitPrice,
						expectedProductUnit: i.expectedProductUnit,
					})),
			}),
		)
		.digest('hex');
@Injectable()
export class SaleService {
	private indexReady?: Promise<string>;
	constructor(
		@InjectModel('Sale') private readonly saleModel: Model<Sale>,
		@InjectModel('Product') private readonly products: Model<Product>,
		@InjectConnection() private readonly connection: Connection,
		@Optional() private readonly socket?: SocketGateway,
	) {}
	private notifyAgents() {
		// Committed sales are authoritative; polling recovers missed socket hints.
		void this.socket?.notifySaleChanged().catch(() => undefined);
	}
	private role(member: Member, role: MemberType) {
		if (!member || member.memberType !== role || member.memberStatus !== MemberStatus.ACTIVE)
			throw new ForbiddenException('Only active members with the required sale role may use this operation');
	}
	private async transact<T>(callback: (session: ClientSession) => Promise<T>): Promise<T> {
		try {
			return await this.connection.transaction(callback, {
				readConcern: { level: 'snapshot' },
				writeConcern: { w: 'majority' },
				readPreference: 'primary',
			});
		} catch (error) {
			if (error?.code === 20 || /transaction numbers.*replica set/i.test(error?.message || ''))
				throw new ServiceUnavailableException('Sales transactions require a MongoDB replica set');
			throw error;
		}
	}
	private async ensureIndex() {
		try {
			this.indexReady ??= this.saleModel.collection.createIndex({ clientId: 1, requestKey: 1 }, { unique: true });
			await this.indexReady;
		} catch (error) {
			this.indexReady = undefined;
			throw error;
		}
	}
	private checkRetry(existing: Sale, hash: string) {
		if (existing.requestHash !== hash)
			throw new ConflictException('Sale request key was already used for different items');
		return existing;
	}
	async requestSale(member: Member, raw: RequestSaleInput): Promise<Sale> {
		this.role(member, MemberType.CLIENT);
		const input = checked(RequestSaleInput, raw);
		input.requestKey = input.requestKey.toLowerCase();
		input.items = input.items.map((item) => ({ ...item, productId: item.productId.toLowerCase() }));
		if (new Set(input.items.map((i) => i.productId)).size !== input.items.length)
			throw new BadRequestException('Duplicate sale product');
		const hash = saleRequestHash(input),
			filter = { clientId: shapeIntoMongoObject(member._id), requestKey: input.requestKey };
		await this.ensureIndex();
		try {
			const result = await this.transact(async (session) => {
				const existing = await this.saleModel.findOne(filter).session(session).lean().exec();
				if (existing) return this.checkRetry(existing, hash);
				const items: SaleLine[] = [];
				let totalAmount = 0;
				for (const requested of [...input.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
					const p = await this.products.findById(requested.productId).session(session).lean().exec();
					if (!p || p.productStatus !== ProductStatus.ACTIVE)
						throw new NotFoundException('Active sale product not found');
					if (p.productUnit !== requested.expectedProductUnit)
						throw new ConflictException('Sale product unit changed; refresh cart');
					if (p.productPrice !== requested.expectedUnitPrice)
						throw new ConflictException('Sale product price changed; refresh cart');
					const milli = Math.round(requested.quantity * 1000),
						step = Math.round(p.productQuantityStep * 1000);
					if (
						(isWholeUnit(p.productUnit) && !Number.isInteger(requested.quantity)) ||
						requested.quantity < p.productMinOrderQuantity ||
						step <= 0 ||
						milli % step !== 0
					)
						throw new BadRequestException('Invalid sale quantity minimum or step');
					const total = Math.round(p.productQuantity * 1000),
						reserved = Math.round(p.productReservedQuantity * 1000);
					if (milli > total - reserved) throw new ConflictException('Insufficient sale stock');
					const amount = saleLineAmount(p.productPrice, requested.quantity);
					if (!isWholeSom(totalAmount + amount))
						throw new BadRequestException('Sale amount exceeds safe integer range');
					totalAmount += amount;
					items.push({
						productId: shapeIntoMongoObject(requested.productId),
						productName: p.productName,
						productType: p.productType,
						productUnit: p.productUnit,
						productBrand: p.productBrand,
						productImage: p.productImages?.[0],
						unitPrice: p.productPrice,
						quantity: requested.quantity,
						quantityMilli: milli,
						lineTotal: amount,
					});
					const result = await this.products
						.updateOne(
							{
								_id: p._id,
								productQuantity: p.productQuantity,
								productReservedQuantity: p.productReservedQuantity,
								productStatus: ProductStatus.ACTIVE,
							},
							{ $set: { productReservedQuantity: (reserved + milli) / 1000 } },
							{ session },
						)
						.exec();
					if (result.matchedCount !== 1) throw new ConflictException('Sale stock changed concurrently');
				}
				if (totalAmount !== input.expectedTotal) throw new ConflictException('Sale total changed; refresh cart');
				const [sale] = await this.saleModel.create(
					[
						{
							...filter,
							requestHash: hash,
							clientName: member.memberFullName || member.memberNick,
							paymentMethod: input.paymentMethod,
							saleStatus: SaleStatus.PENDING,
							items,
							totalAmount,
						},
					],
					{ session },
				);
				return sale.toObject();
			});
			this.notifyAgents();
			return result;
		} catch (error) {
			if (error?.code === 11000) {
				const existing = await this.saleModel.findOne(filter).lean().exec();
				if (existing) return this.checkRetry(existing, hash);
			}
			throw error;
		}
	}
	private async finalize(member: Member, input: SaleIdInput, complete: boolean, reject = false): Promise<Sale> {
		this.role(member, complete || reject ? MemberType.AGENT : MemberType.CLIENT);
		checked(SaleIdInput, input);
		const result = await this.transact(async (session) => {
			const filter: any = { _id: shapeIntoMongoObject(input._id) };
			if (!complete && !reject) filter.clientId = shapeIntoMongoObject(member._id);
			const sale = await this.saleModel.findOne(filter).session(session).lean().exec();
			if (!sale) throw new NotFoundException('Sale request not found');
			const target = complete ? SaleStatus.COMPLETED : SaleStatus.CANCELLED;
			if (sale.saleStatus === target && (!reject || sale.rejectedAt)) return sale;
			if (sale.saleStatus !== SaleStatus.PENDING) throw new ConflictException('Sale already has a final decision');
			for (const line of sale.items) {
				const p = await this.products.findById(line.productId).session(session).lean().exec();
				const quantity = line.quantityMilli;
				if (
					!p ||
					p.productUnit !== line.productUnit ||
					Math.round(p.productReservedQuantity * 1000) < quantity ||
					Math.round(p.productQuantity * 1000) < quantity
				)
					throw new ConflictException('Sale reservation is inconsistent');
				const result = await this.products
					.updateOne(
						{ _id: p._id, productQuantity: p.productQuantity, productReservedQuantity: p.productReservedQuantity },
						{
							$set: {
								productReservedQuantity: (Math.round(p.productReservedQuantity * 1000) - quantity) / 1000,
								...(complete ? { productQuantity: (Math.round(p.productQuantity * 1000) - quantity) / 1000 } : {}),
							},
						},
						{ session },
					)
					.exec();
				if (result.matchedCount !== 1) throw new ConflictException('Sale stock changed concurrently');
			}
			const now = new Date();
			const change = complete
				? {
						saleStatus: target,
						completedAt: now,
						completedDate: attendanceToday(now),
						agentId: shapeIntoMongoObject(member._id),
						agentName: member.memberFullName || member.memberNick,
					}
				: {
						saleStatus: target,
						cancelledAt: now,
						...(reject
							? {
									rejectedAt: now,
									rejectedById: shapeIntoMongoObject(member._id),
									rejectedByName: member.memberFullName || member.memberNick,
								}
							: {}),
					};
			const result = await this.saleModel
				.findOneAndUpdate({ ...filter, saleStatus: SaleStatus.PENDING }, { $set: change }, { new: true, session })
				.lean()
				.exec();
			if (!result) throw new ConflictException('Sale already has a final decision');
			return result;
		});
		this.notifyAgents();
		return result;
	}
	approveSale(member: Member, input: SaleIdInput) {
		return this.finalize(member, input, true);
	}
	cancelSale(member: Member, input: SaleIdInput) {
		return this.finalize(member, input, false);
	}
	rejectSale(member: Member, input: SaleIdInput) {
		return this.finalize(member, input, false, true);
	}
	private async list(filter: Record<string, unknown>, input: OrdinaryInquiry, oldest = false): Promise<Sales> {
		const result = await this.saleModel
			.aggregate([
				{ $match: filter },
				{
					$sort: {
						...(filter.completedDate ? { completedAt: -1 } : { createdAt: oldest ? 1 : -1 }),
						_id: oldest ? 1 : -1,
					},
				},
				{
					$facet: {
						list: [{ $skip: (input.page - 1) * input.limit }, { $limit: input.limit }],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return result[0] || { list: [], metaCounter: [] };
	}
	getMySales(member: Member, raw: SalesInquiry) {
		this.role(member, MemberType.CLIENT);
		const input = checked(SalesInquiry, raw);
		return this.list(
			{ clientId: shapeIntoMongoObject(member._id), ...(input.saleStatus ? { saleStatus: input.saleStatus } : {}) },
			input,
		);
	}
	getPendingSales(member: Member, raw: OrdinaryInquiry) {
		this.role(member, MemberType.AGENT);
		const input = checked(OrdinaryInquiry, raw);
		return this.list({ saleStatus: SaleStatus.PENDING }, input, true);
	}
	getAllSalesByAdmin(member: Member, raw: AdminSalesInquiry) {
		this.role(member, MemberType.ADMIN);
		const input = checked(AdminSalesInquiry, raw);
		return this.list(
			{
				...(input.saleStatus ? { saleStatus: input.saleStatus } : {}),
				...(input.date ? { completedDate: input.date } : {}),
			},
			input,
		);
	}
	async getDailySalesByAdmin(member: Member, raw: DailySalesInput): Promise<DailySalesReport> {
		this.role(member, MemberType.ADMIN);
		const input = checked(DailySalesInput, raw);
		const date = input.date || attendanceToday();
		const [result] = await this.saleModel
			.aggregate([
				{ $match: { saleStatus: SaleStatus.COMPLETED, completedDate: date } },
				{ $sort: { completedAt: -1, _id: -1 } },
				{
					$facet: {
						totals: [{ $group: { _id: null, salesCount: { $sum: 1 }, totalAmount: { $sum: '$totalAmount' } } }],
						products: [
							{ $unwind: '$items' },
							{
								$group: {
									_id: { productId: '$items.productId', productUnit: '$items.productUnit' },
									productName: { $first: '$items.productName' },
									quantityMilli: { $sum: '$items.quantityMilli' },
									totalAmount: { $sum: '$items.lineTotal' },
								},
							},
							{
								$project: {
									_id: 0,
									productId: '$_id.productId',
									productUnit: '$_id.productUnit',
									productName: 1,
									quantity: { $divide: ['$quantityMilli', 1000] },
									totalAmount: 1,
								},
							},
							{ $sort: { totalAmount: -1, productName: 1 } },
						],
					},
				},
			])
			.exec();
		const totalAmount = result?.totals?.[0]?.totalAmount || 0;
		if (!isWholeSom(totalAmount) || result?.products?.some((p: any) => !isWholeSom(p.totalAmount)))
			throw new BadRequestException('Sale report amount exceeds safe integer range');
		return { date, salesCount: result?.totals?.[0]?.salesCount || 0, totalAmount, products: result?.products || [] };
	}
}
