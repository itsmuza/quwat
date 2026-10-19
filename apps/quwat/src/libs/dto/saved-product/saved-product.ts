import { ObjectId } from 'bson';

export interface SavedProduct {
	_id: ObjectId;
	memberId: ObjectId;
	productId: ObjectId;
	createdAt: Date;
	updatedAt: Date;
}
