import { GraphQLScalarType, GraphQLError, Kind } from 'graphql';
export const isWholeSom = (value: unknown): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const parse = (value: unknown): number => {
	if (!isWholeSom(value)) throw new GraphQLError('WholeSom must be a non-negative safe integer in UZS');
	return value;
};
export const WholeSom = new GraphQLScalarType({
	name: 'WholeSom',
	description: 'Non-negative whole UZS som, up to Number.MAX_SAFE_INTEGER.',
	serialize: parse,
	parseValue: parse,
	parseLiteral(ast) {
		if (ast.kind !== Kind.INT) throw new GraphQLError('WholeSom requires an integer literal');
		return parse(Number(ast.value));
	},
});
