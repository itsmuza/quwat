import { Query, Schema } from 'mongoose';
import { ProductStatus, ProductType, ProductUnit } from '../enums/product.enum';
import { isWholeSom } from '../scalars/whole-som.scalar';
import { defaultQuantityStep, isQuantity, isWholeUnit, validQuantityRules } from '../validation/product-quantity';

const quantity = { type: Number, default: 0, validate: isQuantity };
const ProductSchema = new Schema(
	{
		productName: { type: String, required: true, trim: true, minlength: 3, maxlength: 100 },
		productType: { type: String, enum: ProductType, required: true },
		productStatus: { type: String, enum: ProductStatus, default: ProductStatus.DRAFT, required: true },
		productUnit: { type: String, enum: ProductUnit, required: true },
		productPrice: { type: Number, required: true, validate: isWholeSom },
		productBrand: { type: String, trim: true },
		productDesc: { type: String },
		productImages: { type: [String], default: [] },
		productQuantity: {
			...quantity,
			validate: {
				validator(this: any, value: number) {
					return isQuantity(value) && (!isWholeUnit(this.productUnit) || Number.isInteger(value));
				},
			},
		},
		productReservedQuantity: {
			...quantity,
			validate: {
				validator(this: any, value: number) {
					return (
						isQuantity(value) &&
						value <= this.productQuantity &&
						(!isWholeUnit(this.productUnit) || Number.isInteger(value))
					);
				},
			},
		},
		productMinOrderQuantity: {
			type: Number,
			required: true,
			default(this: any) {
				return defaultQuantityStep(this.productUnit);
			},
			validate: {
				validator(this: any, value: number) {
					return this instanceof Query
						? isQuantity(value) && value > 0
						: validQuantityRules(this.productUnit, value, this.productQuantityStep);
				},
			},
		},
		productQuantityStep: {
			type: Number,
			required: true,
			default(this: any) {
				return defaultQuantityStep(this.productUnit);
			},
			validate: (v: number) => isQuantity(v) && v > 0,
		},
		productViews: { type: Number, default: 0, min: 0 },
		productLikes: { type: Number, default: 0, min: 0 },
		productComments: { type: Number, default: 0, min: 0 },
		productRank: { type: Number, default: 0, min: 0 },
		archivedAt: { type: Date, default: null },
	},
	{ timestamps: true, collection: 'products' },
);
ProductSchema.index({ productName: 1 }, { unique: true });
ProductSchema.index({ productStatus: 1, createdAt: -1 });
ProductSchema.index({ productStatus: 1, productType: 1 });
export default ProductSchema;
