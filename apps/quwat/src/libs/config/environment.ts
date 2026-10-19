import type { ConfigService } from '@nestjs/config';

type Environment = Record<string, string | undefined>;

export function environmentFiles(mode = process.env.NODE_ENV): string[] {
	if (mode === 'production') return ['.env.production.local'];
	if (mode === 'test') return ['.env.test.local'];
	return ['.env.development.local', '.env'];
}

export function mongoConnection(config: Pick<ConfigService, 'get'>): { uri: string } {
	const production = config.get<string>('NODE_ENV') === 'production';
	const key = production ? 'MONGO_PROD' : 'MONGO_DEV';
	const uri = config.get<string>(key)?.trim();
	if (!uri) throw new Error(`${key} is required for this environment`);
	// Never echo credentials in configuration errors.
	if (!/^mongodb(?:\+srv)?:\/\//.test(uri)) throw new Error(`${key} must be a MongoDB connection string`);
	const database = uri.split('?', 1)[0].split('://', 2)[1].replace(/^.*@/, '').split('/')[1];
	if (!database || ['admin', 'local', 'config'].includes(database))
		throw new Error(`${key} must name an application database`);
	if (production) {
		const development = config.get<string>('MONGO_DEV');
		if (development) {
			const namespace = (value: string) =>
				value
					.replace(/^mongodb(?:\+srv)?:\/\//, '')
					.replace(/^.*@/, '')
					.split('?')[0]
					.replace(/\/$/, '');
			if (namespace(development) === namespace(uri))
				throw new Error('Production and development databases must differ');
		}
		if (!config.get<string>('SECRET_TOKEN')?.trim()) throw new Error('SECRET_TOKEN is required for production');
	}
	return { uri };
}

export function validateEnvironment(values: Environment): Environment {
	mongoConnection({ get: (key: string) => values[key] } as Pick<ConfigService, 'get'>);
	return values;
}
