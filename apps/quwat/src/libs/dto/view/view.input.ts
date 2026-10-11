import { Field, InputType } from '@nestjs/graphql';
import { isNotEmpty, IsNotEmpty } from 'class-validator';
import { ObjectId } from 'bson';
import { ViewGroup } from '../../enums/view.enum';

@InputType()
export class ViewInput {
	@IsNotEmpty()
	@Field(() => String)
	memberId!: ObjectId;

	@IsNotEmpty()
	@Field(() => String)
	viewRefId!: ObjectId;

	@IsNotEmpty()
	@Field(() => ViewGroup)
	viewGroup!: ViewGroup;
}
