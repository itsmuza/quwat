import { Field, InputType } from '@nestjs/graphql';
import { IsEnum, IsMongoId, IsNotEmpty, IsOptional, Length } from 'class-validator';
import { CommentStatus } from '../../enums/comment.enum';
import { ObjectId } from 'bson';

@InputType()
export class CommentUpdate {
	@IsNotEmpty()
	@IsMongoId()
	@Field(() => String)
	_id!: ObjectId;

	@IsOptional()
	@IsEnum(CommentStatus)
	@Field(() => CommentStatus, { nullable: true })
	commentStatus?: CommentStatus;

	@IsOptional()
	@Length(1, 100)
	@Field(() => String, { nullable: true })
	commentContent?: string;
}
