import { Schema, Types } from 'mongoose';

export interface SaleNotificationRead {
	agentId: Types.ObjectId;
	saleId: Types.ObjectId;
	readAt: Date;
}

const SaleNotificationReadSchema = new Schema<SaleNotificationRead>(
	{
		agentId: { type: Schema.Types.ObjectId, required: true },
		saleId: { type: Schema.Types.ObjectId, required: true },
		readAt: { type: Date, required: true },
	},
	{ collection: 'sale_notification_reads' },
);
SaleNotificationReadSchema.index({ agentId: 1, saleId: 1 }, { unique: true });
export default SaleNotificationReadSchema;
