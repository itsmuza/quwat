import { registerDecorator, ValidationOptions } from 'class-validator';

export const ATTENDANCE_TIME_ZONE = 'Asia/Tashkent';
export const DAY_MS = 86_400_000;

export function attendanceToday(now = new Date()): string {
	const parts = new Intl.DateTimeFormat('en', {
		timeZone: ATTENDANCE_TIME_ZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(now);
	const part = (type: string) => parts.find((value) => value.type === type)!.value;
	return `${part('year')}-${part('month')}-${part('day')}`;
}
export function isAttendanceDate(value: unknown): value is string {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
	const date = new Date(`${value}T00:00:00.000Z`);
	return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export const dateOrdinal = (value: string): number => new Date(`${value}T00:00:00.000Z`).getTime() / DAY_MS;
export const ordinalDate = (value: number): string => new Date(value * DAY_MS).toISOString().slice(0, 10);
export function IsAttendanceDate(options?: ValidationOptions): PropertyDecorator {
	return (object, propertyName) =>
		registerDecorator({
			name: 'isAttendanceDate',
			target: object.constructor,
			propertyName: String(propertyName),
			options,
			validator: { validate: isAttendanceDate, defaultMessage: () => 'Date must be a valid YYYY-MM-DD calendar date' },
		});
}
