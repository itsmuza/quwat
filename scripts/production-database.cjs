/* Explicit operator migration: Quwat -> quwat_prod only. No application imports or test database writes. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
const SOURCE = 'Quwat',
	TARGET = 'quwat_prod';
const backend = path.resolve(__dirname, '..');
function connection(sourceUri) {
	const uri = new URL(sourceUri);
	if (!['mongodb:', 'mongodb+srv:'].includes(uri.protocol) || decodeURIComponent(uri.pathname.slice(1)) !== SOURCE)
		throw new Error('Migration source must explicitly name Quwat');
	const target = new URL(uri);
	target.pathname = '/' + TARGET;
	if (!target.searchParams.has('authSource')) target.searchParams.set('authSource', 'admin');
	return { source: sourceUri, target: target.toString() };
}
function assertEmpty(collections) {
	if (collections.length) throw new Error('quwat_prod is not empty; refusing to overwrite or merge');
}
function canonical(value) {
	if (Array.isArray(value)) return value.map(canonical);
	if (value && typeof value === 'object')
		return Object.fromEntries(
			Object.keys(value)
				.sort()
				.map((key) => [key, canonical(value[key])]),
		);
	return value;
}
async function snapshot(db) {
	const collections = await db.listCollections({}, { nameOnly: false }).toArray();
	const result = {};
	for (const item of collections.sort((a, b) => a.name.localeCompare(b.name))) {
		if (item.name.startsWith('system.')) throw new Error('System collection requires a separate migration review');
		if (item.type !== 'collection') throw new Error('Non-collection namespace requires a separate migration review');
		const collection = db.collection(item.name);
		const hash = crypto.createHash('sha256');
		let count = 0;
		for await (const document of collection.find({}, { raw: true }).sort({ _id: 1 })) {
			if (!Buffer.isBuffer(document)) throw new Error('Expected raw BSON for lossless verification');
			hash.update(document);
			count++;
		}
		const indexes = (await collection.listIndexes().toArray())
			.map((index) => {
				const { ns, ...options } = index;
				// Index key order is significant even though other metadata object order is not.
				return { ...canonical(options), key: Object.entries(options.key) };
			})
			.sort((a, b) => a.name.localeCompare(b.name));
		result[item.name] = { count, sha256: hash.digest('hex'), options: canonical(item.options || {}), indexes };
	}
	return result;
}
function assertSnapshot(expected, actual) {
	if (JSON.stringify(canonical(expected)) !== JSON.stringify(canonical(actual)))
		throw new Error('Database document/index verification mismatch');
}
function filesSnapshot(directory) {
	const result = [];
	function walk(relative = '') {
		for (const entry of fs
			.readdirSync(path.join(directory, relative), { withFileTypes: true })
			.sort((a, b) => a.name.localeCompare(b.name))) {
			const name = path.join(relative, entry.name),
				file = path.join(directory, name);
			if (entry.isSymbolicLink()) throw new Error('Uploads contain a symbolic link; manual review required');
			if (entry.isDirectory()) walk(name);
			else if (entry.isFile())
				result.push({
					path: name,
					size: fs.statSync(file).size,
					sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
				});
		}
	}
	walk();
	return result;
}
function protectTree(directory) {
	fs.chmodSync(directory, 0o700);
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const file = path.join(directory, entry.name);
		if (entry.isDirectory()) protectTree(file);
		else fs.chmodSync(file, 0o600);
	}
}
async function audit(db, uploads) {
	const ids = async (name) =>
		new Set(
			(
				await db
					.collection(name)
					.find({}, { projection: { _id: 1 } })
					.toArray()
			).map((d) => String(d._id)),
		);
	const members = await ids('members'),
		products = await ids('products'),
		sales = await ids('sales');
	const missing = {};
	const images = new Set();
	const check = (key, set, value) => {
		if (value != null && !set.has(String(value))) missing[key] = (missing[key] || 0) + 1;
	};
	for (const name of [
		'members',
		'products',
		'likes',
		'views',
		'comments',
		'saved_products',
		'attendances',
		'sales',
		'sale_notification_reads',
	]) {
		for await (const row of db.collection(name).find({})) {
			if (name === 'members' && row.memberImage) images.add(row.memberImage);
			if (name === 'products') for (const image of row.productImages || []) images.add(image);
			if (['likes', 'views', 'comments', 'saved_products', 'attendances'].includes(name))
				check(name + '.memberId', members, row.memberId);
			if (name === 'saved_products') check(name + '.productId', products, row.productId);
			for (const [groupKey, refKey] of [
				['likeGroup', 'likeRefId'],
				['viewGroup', 'viewRefId'],
				['commentGroup', 'commentRefId'],
			]) {
				if (row[groupKey] === 'PRODUCT') check(name + '.' + refKey, products, row[refKey]);
				if (row[groupKey] === 'MEMBER') check(name + '.' + refKey, members, row[refKey]);
			}
			if (name === 'sale_notification_reads') {
				check(name + '.agentId', members, row.agentId);
				check(name + '.saleId', sales, row.saleId);
			}
			if (name === 'sales') {
				check('sales.clientId', members, row.clientId);
				check('sales.agentId', members, row.agentId);
				for (const item of row.items || []) {
					check('sales.items.productId', products, item.productId);
					if (item.productImage) images.add(item.productImage);
				}
			}
		}
	}
	const missingImages = [];
	for (const image of [...images].sort()) {
		const local = String(image).replace(/^\//, '');
		if (!local.startsWith('uploads/')) continue;
		const file = path.resolve(uploads, local.slice(8));
		if (!file.startsWith(path.resolve(uploads) + path.sep) || !fs.existsSync(file)) missingImages.push(local);
	}
	return { missingReferences: missing, imageReferences: images.size, missingImages };
}
function runTool(binary, args, logfile) {
	const output = spawnSync(binary, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
	fs.writeFileSync(logfile, (output.stdout || '') + (output.stderr || ''), { mode: 0o600 });
	if (output.error || output.status !== 0)
		throw new Error(path.basename(binary) + ' failed; inspect the protected migration log');
}
async function main(args = process.argv.slice(2)) {
	const action = args[0] || 'preflight';
	if (!['preflight', 'copy'].includes(action)) throw new Error('Use preflight or copy --writers-stopped');
	if (action === 'copy' && !args.includes('--writers-stopped'))
		throw new Error('Stop all writers before copying and pass --writers-stopped');
	const parsed = dotenv.parse(fs.readFileSync(path.join(backend, '.env')));
	const uris = connection(process.env.MIGRATION_SOURCE_URI || parsed.MONGO_DEV);
	const sourceClient = new MongoClient(uris.source, {
		appName: 'QuwatProductionMigration',
		serverSelectionTimeoutMS: 10000,
	});
	const targetClient = new MongoClient(uris.target, {
		appName: 'QuwatProductionMigration',
		serverSelectionTimeoutMS: 10000,
	});
	let temp;
	try {
		await sourceClient.connect();
		await targetClient.connect();
		const source = sourceClient.db(SOURCE),
			target = targetClient.db(TARGET);
		assertEmpty(await target.listCollections({}, { nameOnly: true }).toArray());
		const before = await snapshot(source);
		if (action === 'preflight') {
			console.log(
				JSON.stringify(
					{
						source: SOURCE,
						target: TARGET,
						collections: Object.fromEntries(Object.entries(before).map(([name, c]) => [name, c.count])),
						targetEmpty: true,
					},
					null,
					2,
				),
			);
			return;
		}
		const root = path.join(os.homedir(), '.local/share/quwat/backups');
		fs.mkdirSync(root, { recursive: true, mode: 0o700 });
		const backup = fs.mkdtempSync(path.join(root, new Date().toISOString().replace(/[:.]/g, '-') + '-'));
		fs.chmodSync(backup, 0o700);
		console.log('Protected backup directory: ' + backup);
		const uploads = path.join(backend, 'uploads');
		const images = filesSnapshot(uploads);
		const sourceAudit = await audit(source, uploads);
		fs.cpSync(uploads, path.join(backup, 'uploads'), { recursive: true, preserveTimestamps: true });
		protectTree(path.join(backup, 'uploads'));
		if (JSON.stringify(images) !== JSON.stringify(filesSnapshot(path.join(backup, 'uploads'))))
			throw new Error('Uploads backup verification mismatch');
		const archive = path.join(backup, 'Quwat.archive.gz');
		const bin = process.env.MONGODB_TOOLS_BIN || path.join(os.homedir(), '.local/share/quwat/database-tools/100.19.1');
		for (const name of ['mongodump', 'mongorestore']) fs.accessSync(path.join(bin, name), fs.constants.X_OK);
		temp = fs.mkdtempSync(path.join(os.tmpdir(), 'quwat-mongo-config-'));
		fs.chmodSync(temp, 0o700);
		const config = (name, uri) => {
			const file = path.join(temp, name + '.yml');
			fs.writeFileSync(file, 'uri: ' + JSON.stringify(uri) + '\n', { mode: 0o600 });
			return file;
		};
		// Command-line arguments never contain credentials. No --drop, --oplog or automatic retries.
		runTool(
			path.join(bin, 'mongodump'),
			[
				'--config',
				config('source', uris.source),
				'--db',
				SOURCE,
				'--archive=' + archive,
				'--gzip',
				'--readPreference=primary',
			],
			path.join(backup, 'dump.log'),
		);
		fs.chmodSync(archive, 0o600);
		assertSnapshot(before, await snapshot(source));
		assertEmpty(await target.listCollections({}, { nameOnly: true }).toArray());
		fs.writeFileSync(
			path.join(backup, 'manifest.json'),
			JSON.stringify(
				{
					status: 'backed-up',
					source: SOURCE,
					target: TARGET,
					sourceSnapshot: before,
					uploads: images,
					audit: sourceAudit,
				},
				null,
				2,
			),
			{ mode: 0o600 },
		);
		runTool(
			path.join(bin, 'mongorestore'),
			[
				'--config',
				config('target', uris.target),
				'--archive=' + archive,
				'--gzip',
				'--nsInclude=' + SOURCE + '.*',
				'--nsFrom=' + SOURCE + '.*',
				'--nsTo=' + TARGET + '.*',
				'--stopOnError',
			],
			path.join(backup, 'restore.log'),
		);
		const after = await snapshot(target);
		assertSnapshot(before, after);
		assertSnapshot(before, await snapshot(source));
		const targetAudit = await audit(target, uploads);
		if (JSON.stringify(canonical(sourceAudit)) !== JSON.stringify(canonical(targetAudit)))
			throw new Error('Reference verification mismatch');
		if (JSON.stringify(images) !== JSON.stringify(filesSnapshot(uploads)))
			throw new Error('Source uploads changed while copying');
		const manifest = {
			status: 'verified',
			createdAt: new Date().toISOString(),
			source: SOURCE,
			target: TARGET,
			sourceSnapshot: before,
			targetSnapshot: after,
			audit: targetAudit,
			uploads: images,
			archiveSha256: crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),
		};
		fs.writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
		console.log(
			JSON.stringify(
				{
					status: 'verified',
					backup,
					collections: Object.keys(after).length,
					documents: Object.values(after).reduce((n, c) => n + c.count, 0),
					uploads: images.length,
					preexistingMissingReferences: targetAudit.missingReferences,
					missingImageCount: targetAudit.missingImages.length,
				},
				null,
				2,
			),
		);
	} finally {
		if (temp) fs.rmSync(temp, { recursive: true, force: true });
		await sourceClient.close();
		await targetClient.close();
	}
}
module.exports = { connection, assertEmpty, assertSnapshot, snapshot, filesSnapshot, canonical };
if (require.main === module) {
	process.umask(0o077);
	main().catch((error) => {
		console.error(
			error.message?.startsWith('Migration') ||
				/refusing|verification|requires|Stop all|before copying|failed;|namespace|Uploads|System/.test(
					error.message || '',
				)
				? error.message
				: 'Migration failed; no credentials printed. Check access/network and the protected logs.',
		);
		process.exitCode = 1;
	});
}
