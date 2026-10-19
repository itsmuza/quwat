import { Schema } from 'mongoose';

const SavedProductSchema = new Schema(
	{
		memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
		productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
	},
	{ timestamps: true, collection: 'saved_products' },
);

SavedProductSchema.index({ memberId: 1, productId: 1 }, { unique: true });
SavedProductSchema.index({ memberId: 1, createdAt: -1, _id: -1 });

export default SavedProductSchema;
