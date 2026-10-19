import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import { IsBoolean, IsEnum, IsMongoId } from 'class-validator';
import { LikeGroup } from '../../enums/like.enum';
@InputType()
export class GuestLikeInput {
	@IsMongoId() @Field(() => String) likeRefId!: string;
	@IsEnum(LikeGroup) @Field(() => LikeGroup) likeGroup!: LikeGroup;
	@IsBoolean() @Field(() => Boolean) liked!: boolean;
}
@ObjectType()
export class GuestLikeResult {
	@Field(() => String) likeRefId!: string;
	@Field(() => LikeGroup) likeGroup!: LikeGroup;
	@Field(() => Boolean) liked!: boolean;
	@Field(() => Int) likeCount!: number;
}
