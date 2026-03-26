import { z } from 'zod';

// Basic validation schemas
export const IdentifierSchema = z.string().min(1, 'Identifier cannot be empty');
export const NameSchema = z.string().min(1, 'Name cannot be empty').max(255, 'Name too long');
export const OptionalStringSchema = z.string().optional();
export const DateStringSchema = z.string().refine(
  (date) => !isNaN(Date.parse(date)),
  'Invalid date format'
);
export const PositiveNumberSchema = z.number().positive('Must be a positive number');
export const NonNegativeNumberSchema = z.number().min(0, 'Must be non-negative');

// Ingredient validation
export const IngredientSchema = z.object({
  rawIngredient: z.string().min(1, 'Raw ingredient cannot be empty'),
  name: z.string().min(1, 'Ingredient name cannot be empty'),
  quantity: OptionalStringSchema,
  note: OptionalStringSchema,
});

// List management schemas
export const CreateListSchema = z.object({
  name: NameSchema,
  parentId: OptionalStringSchema,
});

export const GetListsSchema = z.object({
  includeItems: z.boolean().optional().default(true),
});

export const AddItemSchema = z.object({
  listId: IdentifierSchema,
  name: NameSchema,
  details: OptionalStringSchema,
  quantity: OptionalStringSchema,
});

export const UpdateItemSchema = z.object({
  listId: IdentifierSchema,
  itemId: IdentifierSchema,
  name: NameSchema.optional(),
  details: OptionalStringSchema,
  quantity: OptionalStringSchema,
  checked: z.boolean().optional(),
});

export const RemoveItemSchema = z.object({
  listId: IdentifierSchema,
  itemId: IdentifierSchema,
});

export const ShareListSchema = z.object({
  listId: IdentifierSchema,
  email: z.string().email('Invalid email address'),
});

export const UncheckAllItemsSchema = z.object({
  listId: IdentifierSchema,
});

// Recipe management schemas
export const CreateRecipeSchema = z.object({
  name: NameSchema,
  note: OptionalStringSchema,
  sourceName: OptionalStringSchema,
  sourceUrl: z.string().url('Invalid URL').optional(),
  ingredients: z.array(IngredientSchema).min(1, 'At least one ingredient is required'),
  preparationSteps: z.array(z.string().min(1, 'Preparation step cannot be empty'))
    .min(1, 'At least one preparation step is required'),
  scaleFactor: PositiveNumberSchema.optional().default(1),
  rating: z.number().min(1).max(5).optional(),
  nutritionalInfo: OptionalStringSchema,
  cookTime: NonNegativeNumberSchema.optional(), // in seconds
  prepTime: NonNegativeNumberSchema.optional(), // in seconds
  servings: OptionalStringSchema,
});

export const UpdateRecipeSchema = z.object({
  recipeId: IdentifierSchema,
  name: NameSchema.optional(),
  note: OptionalStringSchema,
  sourceName: OptionalStringSchema,
  sourceUrl: z.string().url('Invalid URL').optional(),
  ingredients: z.array(IngredientSchema).optional(),
  preparationSteps: z.array(z.string().min(1, 'Preparation step cannot be empty')).optional(),
  scaleFactor: PositiveNumberSchema.optional(),
  rating: z.number().min(1).max(5).optional(),
  nutritionalInfo: OptionalStringSchema,
  cookTime: NonNegativeNumberSchema.optional(),
  prepTime: NonNegativeNumberSchema.optional(),
  servings: OptionalStringSchema,
});

export const DeleteRecipeSchema = z.object({
  recipeId: IdentifierSchema,
});

export const ImportRecipeSchema = z.object({
  url: z.string().url('Invalid URL'),
  name: NameSchema.optional(), // Optional override for recipe name
});

export const GetRecipesSchema = z.object({
  includeDetails: z.boolean().optional().default(true),
  searchTerm: OptionalStringSchema, // Optional search filter
});

// Recipe collection schemas
export const CreateRecipeCollectionSchema = z.object({
  name: NameSchema,
});

export const AddRecipeToCollectionSchema = z.object({
  collectionId: IdentifierSchema,
  recipeId: IdentifierSchema,
});

export const RemoveRecipeFromCollectionSchema = z.object({
  collectionId: IdentifierSchema,
  recipeId: IdentifierSchema,
});

export const DeleteRecipeCollectionSchema = z.object({
  collectionId: IdentifierSchema,
});

// Meal planning schemas
export const CreateMealEventSchema = z.object({
  title: NameSchema,
  date: DateStringSchema,
  details: OptionalStringSchema,
  recipeId: IdentifierSchema.optional(),
  labelId: IdentifierSchema.optional(),
  recipeScaleFactor: PositiveNumberSchema.optional().default(1),
});

export const UpdateMealEventSchema = z.object({
  eventId: IdentifierSchema,
  title: NameSchema.optional(),
  date: DateStringSchema.optional(),
  details: OptionalStringSchema,
  recipeId: IdentifierSchema.optional(),
  recipeScaleFactor: PositiveNumberSchema.optional(),
});

export const DeleteMealEventSchema = z.object({
  eventId: IdentifierSchema,
});

export const GetMealEventsSchema = z.object({
  startDate: DateStringSchema.optional(),
  endDate: DateStringSchema.optional(),
  includeRecipes: z.boolean().optional().default(true),
});

// Utility validation functions
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validateDate(dateString: string): boolean {
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

export function validateUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// Error message helpers
export const ValidationErrors = {
  REQUIRED_FIELD: (field: string) => `${field} is required`,
  INVALID_FORMAT: (field: string, format: string) => `${field} must be a valid ${format}`,
  TOO_SHORT: (field: string, min: number) => `${field} must be at least ${min} characters`,
  TOO_LONG: (field: string, max: number) => `${field} must be no more than ${max} characters`,
  INVALID_RANGE: (field: string, min: number, max: number) => 
    `${field} must be between ${min} and ${max}`,
  INVALID_EMAIL: 'Invalid email address',
  INVALID_URL: 'Invalid URL format',
  INVALID_DATE: 'Invalid date format',
} as const;

// Utility function to validate and parse input
export function validateInput<T>(schema: z.ZodSchema<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const errors = result.error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
    throw new Error(`Validation failed: ${errors}`);
  }
  return result.data;
} 