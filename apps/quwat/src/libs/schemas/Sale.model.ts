import { Schema } from 'mongoose';
import { ProductType, ProductUnit } from '../enums/product.enum';
import { SalePaymentMethod, SaleStatus } from '../enums/sale.enum';
import { isWholeSom } from '../scalars/whole-som.scalar';
import { isQuantity } from '../validation/product-quantity';
const wholeSom = { type: Number, required: true, validate: isWholeSom };
const line = new Schema(
	{
		productId: { type: Schema.Types.ObjectId, required: true },
		productName: { type: String, required: true },
		productType: { type: String, enum: ProductType, required: true },
		productUnit: { type: String, enum: ProductUnit, required: true },
		productBrand: String,
		productImage: String,
		unitPrice: wholeSom,
		lineTotal: wholeSom,
		quantity: { type: Number, required: true, validate: isQuantity },
		quantityMilli: { type: Number, required: true, min: 1, max: 1000000000000, validate: Number.isSafeInteger },
	},
	{ _id: false },
);
const SaleSchema = new Schema(
	{
		clientId: { type: Schema.Types.ObjectId, required: true },
		clientName: { type: String, required: true },
		requestKey: { type: String, required: true },
		requestHash: { type: String, required: true },
		saleStatus: { type: String, enum: SaleStatus, default: SaleStatus.PENDING, required: true },
		paymentMethod: { type: String, enum: SalePaymentMethod, required: true },
		items: { type: [line], required: true },
		totalAmount: wholeSom,
		agentId: { type: Schema.Types.ObjectId, default: null },
		agentName: { type: String, default: null },
		completedDate: { type: String, default: null },
		completedAt: { type: Date, default: null },
		cancelledAt: { type: Date, default: null },
		rejectedAt: { type: Date, default: null },
		rejectedById: { type: Schema.Types.ObjectId, default: null },
		rejectedByName: { type: String, default: null },
	},
	{ timestamps: true, collection: 'sales' },
);
SaleSchema.index({ clientId: 1, requestKey: 1 }, { unique: true });
SaleSchema.index({ saleStatus: 1, createdAt: -1 });
SaleSchema.index({ completedDate: 1, saleStatus: 1 });
SaleSchema.index({ createdAt: -1, _id: -1 });
export default SaleSchema;
