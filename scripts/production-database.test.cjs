const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { connection, assertEmpty, assertSnapshot, filesSnapshot } = require('./production-database.cjs');
test('migration accepts only the explicit Quwat namespace and renames the target on the same cluster', () => {
	const input = 'mongodb+srv://operator:secret@cluster.example/Quwat?retryWrites=true';
	const result = connection(input);
	assert.equal(result.source, input);
	const target = new URL(result.target);
	assert.equal(target.pathname, '/quwat_prod');
	assert.equal(target.hostname, 'cluster.example');
	assert.equal(target.searchParams.get('authSource'), 'admin');
	for (const uri of [
		'mongodb+srv://operator:secret@cluster.example/quwat_prod',
		'mongodb+srv://cluster.example/other',
		'mongodb+srv://cluster.example/',
		'https://cluster.example/Quwat',
	])
		assert.throws(() => connection(uri));
});
test('existing target collections, including empty collections from a partial restore, are never merged or overwritten', () => {
	assert.doesNotThrow(() => assertEmpty([]));
	assert.throws(() => assertEmpty([{ name: 'members' }]), /refusing/);
});
test('verification detects BSON digest, collection count, options and index changes', () => {
	const original = {
		members: {
			count: 2,
			sha256: 'raw-bson-hash',
			options: {},
			indexes: [{ name: 'nick_1', unique: true, key: [['nick', 1]] }],
		},
	};
	assert.doesNotThrow(() => assertSnapshot(original, structuredClone(original)));
	for (const change of [{ count: 3 }, { sha256: 'modified-bson' }, { options: { validator: {} } }, { indexes: [] }])
		assert.throws(() => assertSnapshot(original, { members: { ...original.members, ...change } }), /mismatch/);
	assert.throws(() => assertSnapshot(original, {}), /mismatch/);
});
test('uploads verification hashes file contents and rejects unexpected symbolic links', () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'quwat-migration-test-'));
	try {
		fs.mkdirSync(path.join(directory, 'product'));
		fs.writeFileSync(path.join(directory, 'product', 'one.webp'), 'photo');
		const before = filesSnapshot(directory);
		assert.equal(before.length, 1);
		fs.writeFileSync(path.join(directory, 'product', 'one.webp'), 'changed');
		assert.notEqual(filesSnapshot(directory)[0].sha256, before[0].sha256);
		fs.symlinkSync(path.join(directory, 'product', 'one.webp'), path.join(directory, 'link'));
		assert.throws(() => filesSnapshot(directory), /symbolic link/);
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});
