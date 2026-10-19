const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
const directory = path.resolve(__dirname, '..');
(async () => {
	const results = [];
	for (const [name, file, key, own, other] of [
		['development', 'env.development.local', 'MONGO_DEV', 'Quwat', 'quwat_prod'],
		['production', 'env.production.local', 'MONGO_PROD', 'quwat_prod', 'Quwat'],
	]) {
		const env = dotenv.parse(fs.readFileSync(path.join(directory, '.' + file)));
		const client = new MongoClient(env[key], {
			appName: 'QuwatReadOnlyAccessVerification',
			serverSelectionTimeoutMS: 10000,
		});
		try {
			await client.connect();
			const count = await client.db(own).collection('members').countDocuments({});
			const status = await client.db('admin').command({ connectionStatus: 1 });
			const roles = status.authInfo.authenticatedUserRoles;
			if (roles.length !== 1 || roles[0].role !== 'readWrite' || roles[0].db !== own)
				throw new Error('Unexpected role scope');
			let denied = false;
			try {
				await client
					.db(other)
					.collection('members')
					.findOne({}, { projection: { _id: 1 } });
			} catch (error) {
				if (
					error.code === 13 ||
					(error.code === 8000 && /not authorized|not allowed|unauthorized/i.test(error.message))
				)
					denied = true;
				else throw error;
			}
			if (!denied) throw new Error('Cross-database access was not denied');
			results.push({ environment: name, database: own, memberCount: count, role: roles[0], otherDatabaseDenied: true });
		} finally {
			await client.close();
		}
	}
	console.log(JSON.stringify(results, null, 2));
})().catch((error) => {
	console.error(JSON.stringify({ verification: 'not-ready-or-failed', code: error.code || error.name }));
	process.exitCode = 1;
});
