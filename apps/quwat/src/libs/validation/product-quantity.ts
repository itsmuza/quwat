import { ProductUnit } from '../enums/product.enum';
export const MAX_QUANTITY = 1_000_000_000;
export const isQuantity = (value: unknown): value is number =>
	typeof value === 'number' &&
	Number.isFinite(value) &&
	value >= 0 &&
	value <= MAX_QUANTITY &&
	Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001;
export const isWholeUnit = (unit: ProductUnit): boolean => unit === ProductUnit.DONA || unit === ProductUnit.QOP;
export const defaultQuantityStep = (unit: ProductUnit): number => (isWholeUnit(unit) ? 1 : 0.001);
export function validQuantityRules(unit: ProductUnit, minimum: number, step: number): boolean {
	if (!isQuantity(minimum) || !isQuantity(step) || minimum <= 0 || step <= 0) return false;
	if (isWholeUnit(unit) && (!Number.isInteger(minimum) || !Number.isInteger(step))) return false;
	return Math.round(minimum * 1000) % Math.round(step * 1000) === 0;
}
