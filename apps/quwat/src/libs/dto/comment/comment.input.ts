import { Field, InputType, Int } from '@nestjs/graphql';
import {
	IsEnum,
	IsIn,
	IsInt,
	IsMongoId,
	Max,
	ValidateNested,
	IsNotEmpty,
	IsOptional,
	Length,
	Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ObjectId } from 'bson';
import { CommentGroup } from '../../enums/comment.enum';
import { Direction } from '../../enums/common.enum';
import { availableCommentSorts } from '../../config';

@InputType()
export class CommentInput {
	@IsNotEmpty()
	@IsEnum(CommentGroup)
	@Field(() => CommentGroup)
	commentGroup!: CommentGroup;

	@IsNotEmpty()
	@Length(1, 100)
	@Field(() => String)
	commentContent!: string;

	@IsNotEmpty()
	@IsMongoId()
	@Field(() => String)
	commentRefId!: ObjectId;

	memberId?: ObjectId;
}

@InputType()
class CISearch {
	@IsEnum(CommentGroup)
	@Field(() => CommentGroup)
	commentGroup!: CommentGroup;

	@IsNotEmpty()
	@IsMongoId()
	@Field(() => String)
	commentRefId!: ObjectId;
}

@InputType()
export class CommentsInquiry {
	@IsNotEmpty()
	@Min(1)
	@IsInt()
	@Field(() => Int)
	page!: number;

	@IsNotEmpty()
	@Min(1)
	@IsInt()
	@Max(100)
	@Field(() => Int)
	limit!: number;

	@IsOptional()
	@IsIn(availableCommentSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsNotEmpty()
	@ValidateNested()
	@Type(() => CISearch)
	@Field(() => CISearch)
	search!: CISearch;
}
