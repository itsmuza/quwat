import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { GraphQLModule, GraphQLSchemaHost, Query, Resolver } from '@nestjs/graphql';
import { ApolloDriver } from '@nestjs/apollo';
import { graphql, printSchema } from 'graphql';
import { writeFileSync } from 'fs';
import { AdminDeletionResolver } from './admin-deletion.resolver';
import { AdminDeletionService } from './admin-deletion.service';
import { AuthService } from '../auth/auth.service';
@Resolver()
class TestQuery {
	@Query(() => Boolean)
	deletionTestReady() {
		return true;
	}
}
describe('Permanent deletion GraphQL permissions', () => {
	let app: any, member: any;
	const service = { deleteProduct: jest.fn(async () => true), deleteMember: jest.fn(async () => true) };
	beforeAll(async () => {
		const module = await Test.createTestingModule({
			imports: [GraphQLModule.forRoot({ driver: ApolloDriver, autoSchemaFile: true })],
			providers: [
				AdminDeletionResolver,
				TestQuery,
				{ provide: AdminDeletionService, useValue: service },
				{
					provide: AuthService,
					useValue: {
						verifyToken: async () => {
							if (!member || member.memberStatus !== 'ACTIVE') throw new Error('Unauthenticated');
							return member;
						},
					},
				},
			],
		}).compile();
		app = module.createNestApplication({ logger: false });
		await app.init();
		if (process.env.QUWAT_DELETE_SCHEMA_OUT)
			writeFileSync(process.env.QUWAT_DELETE_SCHEMA_OUT, printSchema(app.get(GraphQLSchemaHost).schema));
	});
	afterAll(async () => app?.close());
	beforeEach(() => {
		jest.clearAllMocks();
		member = { _id: '507f1f77bcf86cd799439011', memberType: 'ADMIN', memberStatus: 'ACTIVE' };
	});
	const run = (field: string) =>
		graphql({
			schema: app.get(GraphQLSchemaHost).schema,
			source: `mutation { ${field}(${field.includes('Product') ? 'productId' : 'memberId'}: "507f1f77bcf86cd799439012") }`,
			contextValue: { req: { headers: member ? { authorization: 'Bearer test' } : {}, body: {} } },
		});
	it('returns boolean and supplies authenticated actor for both operations', async () => {
		for (const [field, method] of [
			['deleteProductPermanentlyByAdmin', 'deleteProduct'],
			['deleteMemberPermanentlyByAdmin', 'deleteMember'],
		]) {
			const result = await run(field);
			expect(result.errors).toBeUndefined();
			expect(result.data?.[field]).toBe(true);
			expect(service[method]).toHaveBeenCalledWith(member, '507f1f77bcf86cd799439012');
		}
	});
	it.each(['CLIENT', 'AGENT', 'BLOCK', null])('denies %p for both operations', async (role) => {
		if (role === null) member = null;
		else if (role === 'BLOCK') member.memberStatus = 'BLOCK';
		else member.memberType = role;
		for (const field of ['deleteProductPermanentlyByAdmin', 'deleteMemberPermanentlyByAdmin'])
			expect((await run(field)).errors?.length).toBeGreaterThan(0);
		expect(service.deleteProduct).not.toHaveBeenCalled();
		expect(service.deleteMember).not.toHaveBeenCalled();
	});
});
