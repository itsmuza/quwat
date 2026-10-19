// Explicit one-time deployment command. Importing this file never connects to a database.
const mongoose = require('mongoose');

function buildAttendanceInitialization(now = new Date()) {
	const parts = new Intl.DateTimeFormat('en', {
		timeZone: 'Asia/Tashkent',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(now);
	const part = (type) => parts.find((value) => value.type === type).value;
	const attendanceStartDate = `${part('year')}-${part('month')}-${part('day')}`;
	return {
		filter: { memberType: 'AGENT', attendanceStartDate: null },
		update: { $set: { attendanceStartDate } },
	};
}

async function main() {
	const uri = process.env.ATTENDANCE_SETUP_MONGO_URI;
	if (!uri)
		throw new Error('Set ATTENDANCE_SETUP_MONGO_URI to the explicitly selected Quwat database; .env is not loaded.');
	const { filter, update } = buildAttendanceInitialization();
	try {
		await mongoose.connect(uri);
		const result = await mongoose.connection.collection('members').updateMany(filter, update);
		console.log(
			`Attendance initialized for ${result.modifiedCount} agent(s), start date ${update.$set.attendanceStartDate}.`,
		);
	} finally {
		await mongoose.disconnect();
	}
}

module.exports = { buildAttendanceInitialization };
if (require.main === module)
	main().catch(() => {
		console.error(
			'Attendance setup failed. Set ATTENDANCE_SETUP_MONGO_URI explicitly, check the selected database connection, and retry.',
		);
		process.exitCode = 1;
	});
