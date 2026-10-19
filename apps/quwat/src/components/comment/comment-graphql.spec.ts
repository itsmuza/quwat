import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { GraphQLModule, GraphQLSchemaHost } from '@nestjs/graphql';
import { ApolloDriver } from '@nestjs/apollo';
import { graphql } from 'graphql';
import { ObjectId } from 'bson';
import { CommentResolver } from './comment.resolver';
import { CommentService } from './comment.service';
import { AuthService } from '../auth/auth.service';
import { MemberService } from '../member/member.service';
import { ProductService } from '../product/product.service';
import { MemberType } from '../../libs/enums/member.enum';

const authorId = new ObjectId();
const targetId = new ObjectId().toHexString();
const query = (value: unknown): any => ({ exec: jest.fn().mockResolvedValue(value) });

describe('Comments through Nest GraphQL and strict validation (no database)', () => {
	let app: INestApplication;
	let role: MemberType;
	let comments: any[];
	const members = { memberStatsEditor: jest.fn().mockResolvedValue({}) };
	const products = {
		requireActiveProduct: jest.fn().mockResolvedValue({}),
		productStatsEditor: jest.fn().mockResolvedValue({}),
	};
	const model = {
		create: jest.fn(async (input: any) => {
			const entry = {
				...input,
				_id: new ObjectId(),
				commentStatus: 'ACTIVE',
				createdAt: new Date(),
				updatedAt: new Date(),
			};
			comments.push(entry);
			return entry;
		}),
		findOneAndUpdate: jest.fn((filter: any, input: any) => {
			const entry = comments.find(
				(c) =>
					String(c._id) === String(filter._id) &&
					String(c.memberId) === String(filter.memberId) &&
					c.commentStatus === filter.commentStatus,
			);
			if (entry)
				Object.assign(entry, Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)));
			return query(entry);
		}),
		aggregate: jest.fn((pipeline: any[]) => {
			const match = pipeline[0].$match;
			const list = comments.filter(
				(c) =>
					c.commentGroup === match.commentGroup &&
					String(c.commentRefId) === String(match.commentRefId) &&
					c.commentStatus === match.commentStatus,
			);
			return query([{ list, metaCounter: [{ total: list.length }] }]);
		}),
	};
	beforeAll(async () => {
		const module = await Test.createTestingModule({
			imports: [GraphQLModule.forRoot({ driver: ApolloDriver, autoSchemaFile: true })],
			providers: [
				CommentResolver,
				CommentService,
				{ provide: getModelToken('Comment'), useValue: model },
				{ provide: MemberService, useValue: members },
				{ provide: ProductService, useValue: products },
				{
					provide: AuthService,
					useValue: { verifyToken: jest.fn(async () => ({ _id: authorId, memberNick: 'test', memberType: role })) },
				},
			],
		}).compile();
		app = module.createNestApplication({ logger: false });
		app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
		await app.init();
	});
	afterAll(async () => {
		await app?.close();
	});
	beforeEach(() => {
		jest.clearAllMocks();
		jest.spyOn(console, 'info').mockImplementation(() => undefined);
		jest.spyOn(console, 'log').mockImplementation(() => undefined);
		role = MemberType.CLIENT;
		comments = [];
	});
	afterEach(() => jest.restoreAllMocks());
	const create =
		'mutation CreateComment($input: CommentInput!) { createComment(input: $input) { _id memberId commentRefId commentGroup commentContent commentStatus } }';
	const fields = { commentGroup: 'MEMBER', commentContent: 'Yaxshi agent', commentRefId: targetId };
	async function run(source: string, input: any, signed = true) {
		return graphql({
			schema: app.get(GraphQLSchemaHost).schema,
			source,
			variableValues: { input },
			contextValue: { req: { headers: signed ? { authorization: 'Bearer test' } : {}, body: {} } },
		});
	}
	it.each([MemberType.CLIENT, MemberType.AGENT, MemberType.ADMIN])(
		'allows authenticated %s to comment on an agent',
		async (type) => {
			role = type;
			const result = await run(create, fields);
			expect(result.errors).toBeUndefined();
			expect(result.data?.createComment).toMatchObject({
				memberId: authorId.toHexString(),
				commentRefId: targetId,
				commentGroup: 'MEMBER',
				commentContent: fields.commentContent,
			});
			expect(model.create).toHaveBeenCalledWith(expect.objectContaining({ memberId: authorId }));
			expect(members.memberStatsEditor).toHaveBeenCalledWith({
				_id: new ObjectId(targetId),
				targetKey: 'memberComments',
				modifier: 1,
			});
			expect(products.requireActiveProduct).not.toHaveBeenCalled();
		},
	);
	it('retains product validation and discriminator-specific counters', async () => {
		const result = await run(create, { ...fields, commentGroup: 'PRODUCT' });
		expect(result.errors).toBeUndefined();
		expect(products.requireActiveProduct).toHaveBeenCalledWith(new ObjectId(targetId));
		expect(products.productStatsEditor).toHaveBeenCalledWith({
			_id: new ObjectId(targetId),
			targetKey: 'productComments',
			modifier: 1,
		});
		expect(members.memberStatsEditor).not.toHaveBeenCalled();
	});
	it('lists, edits and soft-deletes the authenticated author comment', async () => {
		expect((await run(create, fields)).errors).toBeUndefined();
		const list = await run(
			'query GetComments($input: CommentsInquiry!) { getComments(input: $input) { list { _id commentContent } metaCounter { total } } }',
			{ page: 1, limit: 10, search: { commentGroup: 'MEMBER', commentRefId: targetId } },
		);
		expect(list.errors).toBeUndefined();
		expect(list.data?.getComments).toMatchObject({ metaCounter: [{ total: 1 }] });
		const update =
			'mutation UpdateComment($input: CommentUpdate!) { updateComment(input: $input) { commentContent commentStatus } }';
		const id = comments[0]._id.toHexString();
		const edited = await run(update, { _id: id, commentContent: 'Rahmat' });
		expect(edited.errors).toBeUndefined();
		expect(edited.data?.updateComment).toMatchObject({ commentContent: 'Rahmat' });
		const deleted = await run(update, { _id: id, commentStatus: 'DELETE' });
		expect(deleted.errors).toBeUndefined();
		expect(deleted.data?.updateComment).toMatchObject({ commentStatus: 'DELETE' });
		expect(members.memberStatsEditor).toHaveBeenLastCalledWith({
			_id: new ObjectId(targetId),
			targetKey: 'memberComments',
			modifier: -1,
		});
	});
	it.each([
		{ commentContent: '' },
		{ commentContent: 'x'.repeat(101) },
		{ commentRefId: 'bad' },
		{ memberId: new ObjectId().toHexString() },
	])('rejects invalid input or a spoofed author: %j', async (invalid) => {
		expect((await run(create, { ...fields, ...invalid })).errors?.length).toBeGreaterThan(0);
		expect(model.create).not.toHaveBeenCalled();
	});
	it('rejects guests before insertion', async () => {
		expect((await run(create, fields, false)).errors?.length).toBeGreaterThan(0);
		expect(model.create).not.toHaveBeenCalled();
	});
});
