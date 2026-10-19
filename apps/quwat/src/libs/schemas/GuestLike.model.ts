import { Schema } from 'mongoose';
import { LikeGroup } from '../enums/like.enum';
const GuestLikeSchema = new Schema(
	{
		guestKey: { type: String, required: true },
		likeRefId: { type: Schema.Types.ObjectId, required: true },
		likeGroup: { type: String, enum: LikeGroup, required: true },
	},
	{ timestamps: true, collection: 'guest_likes' },
);
GuestLikeSchema.index({ guestKey: 1, likeGroup: 1, likeRefId: 1 }, { unique: true });
export default GuestLikeSchema;
