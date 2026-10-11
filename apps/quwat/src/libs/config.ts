import { ObjectId } from 'bson';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { LikeGroup } from './enums/like.enum';
export const availableAgentSorts = ['createdAt', 'updatedAt', 'memberLikes', 'memberViews', 'memberRank'];
export const availableMemberSorts = ['createdAt', 'updatedAt', 'memberLikes', 'memberViews'];
export const availableProductSorts = [
	'createdAt',
	'updatedAt',
	'productLikes',
	'productViews',
	'productRank',
	'productPrice',
];
export const availableCommentSorts = ['createdAt', 'updatedAt'];
export const validMimeTypes = ['image/png', 'image/jpg', 'image/jpeg'];
export const getSerialForImage = (filename: string): string => randomUUID() + path.parse(filename).ext;
export const shapeIntoMongoObject = (target: string | ObjectId): ObjectId =>
	typeof target === 'string' ? new ObjectId(target) : target;
export const lookupAuthMemberLiked = (memberId: ObjectId | null, group: LikeGroup, targetRefId = '$_id') => ({
	$lookup: {
		from: 'likes',
		let: { localLikeRefId: targetRefId, localMemberId: memberId },
		pipeline: [
			{
				$match: {
					$expr: {
						$and: [
							{ $eq: ['$likeRefId', '$$localLikeRefId'] },
							{ $eq: ['$memberId', '$$localMemberId'] },
							{ $eq: ['$likeGroup', group] },
						],
					},
				},
			},
			{ $project: { _id: 0, memberId: 1, likeRefId: 1, myFavorite: { $literal: true } } },
		],
		as: 'meLiked',
	},
});
// Comment author lookup. Product cards have no owner lookup.
export const lookupMember = {
	$lookup: {
		from: 'members',
		localField: 'memberId',
		foreignField: '_id',
		pipeline: [{ $project: { memberPassword: 0 } }],
		as: 'memberData',
	},
};
