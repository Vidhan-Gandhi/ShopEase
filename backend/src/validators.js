const { z } = require('zod');

const PASSWORD_MSG = 'Password must be at least 8 characters and contain a letter and a number';
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const isObjectId = (v) => typeof v === 'string' && OBJECT_ID.test(v);

const text = (label, min, max) =>
  z
    .string({ required_error: `${label} is required`, invalid_type_error: `${label} must be text` })
    .trim()
    .min(1, `${label} is required`)
    .min(min, `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`);

const email = z
  .string({ required_error: 'Email is required', invalid_type_error: 'Email must be text' })
  .trim()
  .toLowerCase()
  .min(1, 'Email is required')
  .max(254, 'Email must be at most 254 characters')
  .email('Enter a valid email');

const newPassword = z
  .string({ required_error: PASSWORD_MSG, invalid_type_error: PASSWORD_MSG })
  .min(8, PASSWORD_MSG)
  .max(72, PASSWORD_MSG)
  .regex(/[A-Za-z]/, PASSWORD_MSG)
  .regex(/[0-9]/, PASSWORD_MSG);

const PHONE_MSG = 'Enter a valid 10-digit mobile number';
const phone = z.string({ required_error: PHONE_MSG, invalid_type_error: PHONE_MSG }).trim().regex(/^[6-9]\d{9}$/, PHONE_MSG);

const signup = z.object({ name: text('Name', 2, 50), email, password: newPassword });

const login = z.object({
  email: z
    .string({ required_error: 'Email is required', invalid_type_error: 'Email must be text' })
    .trim()
    .toLowerCase()
    .min(1, 'Email is required')
    .max(254, 'Enter a valid email')
    .email('Enter a valid email'),
  password: z
    .string({ required_error: 'Password is required', invalid_type_error: 'Password is required' })
    .min(1, 'Password is required')
    .max(1000, 'Password is too long'),
});

const profile = z.object({
  name: text('Name', 2, 50),
  phone: z.union([phone, z.literal(''), z.null()], { errorMap: () => ({ message: PHONE_MSG }) }).optional(),
});

const changePassword = z.object({
  currentPassword: z
    .string({ required_error: 'Current password is required', invalid_type_error: 'Current password is required' })
    .min(1, 'Current password is required')
    .max(1000, 'Current password is too long'),
  newPassword,
});

const address = z.object({
  name: text('Name', 2, 50),
  phone,
  addressLine: text('Address', 5, 150),
  city: text('City', 2, 50),
  state: text('State', 2, 50),
  pincode: z
    .string({ required_error: 'Enter a valid 6-digit pincode', invalid_type_error: 'Enter a valid 6-digit pincode' })
    .trim()
    .regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit pincode'),
  isDefault: z.boolean({ invalid_type_error: 'isDefault must be true or false' }).optional(),
});

const idString = (label) =>
  z
    .string({ required_error: `${label} is required`, invalid_type_error: `${label} must be text` })
    .trim()
    .min(1, `${label} is required`);

const quantityMsg = 'Quantity must be a whole number of at least 1';
const quantity = z
  .number({ required_error: quantityMsg, invalid_type_error: quantityMsg })
  .int(quantityMsg)
  .min(1, quantityMsg)
  .max(100000, quantityMsg);

const cartLines = z.object({
  items: z
    .array(z.object({ productId: idString('Product id'), quantity }), {
      required_error: 'items is required',
      invalid_type_error: 'items must be a list',
    })
    .max(100, 'Too many items'),
});

const addItem = z.object({ productId: idString('Product id'), quantity: quantity.optional().default(1) });
const setQuantity = z.object({ quantity });

const PAYMENT_MSG = 'Invalid payment method';
const orderBody = z.object({
  addressId: idString('Address'),
  paymentMethod: z.enum(['COD', 'ONLINE'], { errorMap: () => ({ message: PAYMENT_MSG }) }),
  reviewedItems: z
    .array(
      z.object({
        productId: idString('Product id'),
        unitPrice: z.number().min(0),
        quantity: z.number().int().min(1),
      })
    )
    .max(100)
    .optional(),
});

const pageField = z
  .string({ invalid_type_error: 'Page must be a positive whole number' })
  .regex(/^[1-9]\d{0,8}$/, 'Page must be a positive whole number')
  .optional();

const priceField = z
  .string({ invalid_type_error: 'Enter a valid price' })
  .regex(/^\d+(\.\d{1,2})?$/, 'Enter a valid price')
  .optional();

const SORTS = ['newest', 'price_asc', 'price_desc', 'name_asc'];
const productQuery = z
  .object({
    q: z.string({ invalid_type_error: 'Search must be text' }).max(1000, 'Search is too long').optional(),
    category: z.string({ invalid_type_error: 'Invalid category' }).regex(OBJECT_ID, 'Invalid category').optional(),
    minPrice: priceField,
    maxPrice: priceField,
    sort: z.enum(SORTS, { errorMap: () => ({ message: 'Invalid sort option' }) }).optional(),
    page: pageField,
  })
  .superRefine((v, ctx) => {
    if (v.q !== undefined && v.q.trim().length > 100) {
      ctx.addIssue({ code: 'custom', path: ['q'], message: 'Search must be at most 100 characters' });
    }
    if (v.minPrice !== undefined && v.maxPrice !== undefined && Number(v.minPrice) > Number(v.maxPrice)) {
      ctx.addIssue({ code: 'custom', path: ['minPrice'], message: 'Minimum price cannot be more than maximum price' });
    }
  });

const adminProductQuery = z.object({
  q: z.string({ invalid_type_error: 'Search must be text' }).max(100, 'Search must be at most 100 characters').optional(),
  page: pageField,
});

const pageQuery = z.object({ page: pageField });

const adminOrderQuery = z.object({
  status: z
    .enum(['All', 'Placed', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'], { errorMap: () => ({ message: 'Invalid status' }) })
    .optional(),
  page: pageField,
});

const twoDecimals = (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
const money = (label, max) =>
  z
    .number({ required_error: `${label} is required`, invalid_type_error: `${label} must be a number` })
    .positive(`${label} must be greater than 0`)
    .max(max, `${label} must be at most ${max}`)
    .refine(twoDecimals, `${label} can have at most 2 decimal places`);

const imageMsg = 'Image must be a valid http or https URL';
const imageUrl = z
  .string({ invalid_type_error: imageMsg, required_error: imageMsg })
  .trim()
  .max(2048, 'Image URL is too long')
  .refine((u) => {
    if (!/^https?:\/\//i.test(u)) return false;
    try {
      const parsed = new URL(u);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (e) {
      return false;
    }
  }, imageMsg);

const STOCK_MSG = 'Stock must be a whole number between 0 and 100000';
const productBody = z
  .object({
    name: text('Name', 2, 120),
    description: text('Description', 1, 2000),
    price: money('Price', 10000000),
    discountedPrice: money('Discounted price', 10000000).nullable().optional(),
    category: z
      .string({ required_error: 'Category is required', invalid_type_error: 'Category is required' })
      .regex(OBJECT_ID, 'Category is required'),
    stock: z
      .number({ required_error: STOCK_MSG, invalid_type_error: STOCK_MSG })
      .int(STOCK_MSG)
      .min(0, STOCK_MSG)
      .max(100000, STOCK_MSG),
    images: z
      .array(imageUrl, {
        required_error: 'At least one image URL is required',
        invalid_type_error: 'At least one image URL is required',
      })
      .min(1, 'At least one image URL is required')
      .max(8, 'At most 8 images are allowed'),
    featured: z.boolean({ invalid_type_error: 'Featured must be true or false' }).optional().default(false),
  })
  .superRefine((v, ctx) => {
    if (typeof v.discountedPrice === 'number' && typeof v.price === 'number' && v.discountedPrice >= v.price) {
      ctx.addIssue({ code: 'custom', path: ['discountedPrice'], message: 'Discounted price must be less than price' });
    }
  });

const categoryBody = z.object({ name: text('Name', 2, 40) });

const statusBody = z.object({
  status: z.enum(['Placed', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'], {
    errorMap: () => ({ message: 'Invalid status' }),
  }),
});

module.exports = {
  isObjectId,
  signup,
  login,
  profile,
  changePassword,
  address,
  cartLines,
  addItem,
  setQuantity,
  orderBody,
  productQuery,
  adminProductQuery,
  pageQuery,
  adminOrderQuery,
  productBody,
  categoryBody,
  statusBody,
};
