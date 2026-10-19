import { environmentFiles, mongoConnection, validateEnvironment } from './environment';
import type { ConfigService } from '@nestjs/config';
const config = (values: Record<string, string>) =>
	({ get: (key: string) => values[key] }) as Pick<ConfigService, 'get'>;
const development = 'mongodb+srv://dev:private@cluster.example/Quwat';
const production = 'mongodb+srv://prod:private@cluster.example/quwat_prod';
describe('Environment/database isolation (no database)', () => {
	it('loads only production-local in production, and development-local before legacy env in development', () => {
		expect(environmentFiles('production')).toEqual(['.env.production.local']);
		expect(environmentFiles('development')).toEqual(['.env.development.local', '.env']);
		expect(environmentFiles('test')).toEqual(['.env.test.local']);
	});
	it('selects the matching environment URI', () => {
		expect(mongoConnection(config({ MONGO_DEV: development, MONGO_PROD: production }))).toEqual({ uri: development });
		expect(
			mongoConnection(
				config({
					NODE_ENV: 'production',
					MONGO_DEV: development,
					MONGO_PROD: production,
					SECRET_TOKEN: 'isolated-test-secret',
				}),
			),
		).toEqual({ uri: production });
	});
	it('never falls back to development in production', () => {
		expect(() =>
			mongoConnection(config({ NODE_ENV: 'production', MONGO_DEV: development, SECRET_TOKEN: 'test' })),
		).toThrow('MONGO_PROD is required');
	});
	it('requires a production signing secret', () => {
		expect(() => validateEnvironment({ NODE_ENV: 'production', MONGO_PROD: production })).toThrow(
			'SECRET_TOKEN is required',
		);
	});
	it('rejects the same database even with different credentials or URI options', () => {
		expect(() =>
			mongoConnection(
				config({
					NODE_ENV: 'production',
					MONGO_DEV: development,
					MONGO_PROD: 'mongodb+srv://other:private@cluster.example/Quwat?retryWrites=true',
					SECRET_TOKEN: 'test',
				}),
			),
		).toThrow('must differ');
	});
	it.each([
		'',
		'https://private.example/Quwat',
		'mongodb://localhost',
		'mongodb://localhost/admin',
		'mongodb://localhost/config',
		'mongodb://localhost/local',
	])('rejects an absent/malformed/system database without echoing credentials: %s', (uri) => {
		let message = '';
		try {
			mongoConnection(config({ MONGO_DEV: uri }));
		} catch (error) {
			message = (error as Error).message;
		}
		expect(message).not.toBe('');
		expect(message).not.toContain('private');
	});
});
