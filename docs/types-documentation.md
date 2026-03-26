# Type Definitions and Validation Schemas

## Overview

This document provides comprehensive documentation for all TypeScript types and Zod validation schemas used in the AnyList MCP server.

## Core Data Types

### Configuration Types

#### `AnyListConfig`
Configuration for AnyList service connection.
```typescript
interface AnyListConfig {
  email?: string;
  password?: string;
  credentialsFile?: string;
}
```

#### `ServiceOptions`
Advanced service configuration options.
```typescript
interface ServiceOptions {
  enableCaching?: boolean;
  enableMetrics?: boolean;
  enableRateLimit?: boolean;
  timeout?: number;
  apiBaseUrl?: string;
  rateLimitConfig?: RateLimitOptions;
  cacheSettings?: {
    defaultTtl: number;
    maxEntries: number;
  };
}
```

### Data Model Types

#### `ListInfo`
Represents an AnyList shopping list with its items.
```typescript
interface ListInfo {
  identifier: string;
  parentId?: string;
  name: string;
  items: ItemInfo[];
}
```

#### `ItemInfo`
Represents an item within a shopping list.
```typescript
interface ItemInfo {
  listId: string;
  identifier: string;
  name: string;
  details?: string;
  quantity?: string;
  checked: boolean;
  manualSortIndex?: number;
  userId?: string;
  categoryMatchId?: string;
}
```

#### `RecipeInfo`
Comprehensive recipe information.
```typescript
interface RecipeInfo {
  identifier: string;
  timestamp: number;
  name: string;
  note?: string;
  sourceName?: string;
  sourceUrl?: string;
  source?: string;
  ingredients: IngredientInfo[];
  preparationSteps: string[];
  instructions: string[];
  photoIds?: string[];
  adCampaignId?: string;
  photoUrls?: string[];
  scaleFactor: number;
  rating?: number;
  creationTimestamp: number;
  nutritionalInfo?: string;
  cookTime?: number; // in seconds
  prepTime?: number; // in seconds
  servings?: string;
  paprikaIdentifier?: string;
}
```

#### `IngredientInfo`
Individual recipe ingredient.
```typescript
interface IngredientInfo {
  rawIngredient: string;
  name: string;
  quantity?: string;
  note?: string;
}
```

#### `MealEventInfo`
Meal planning event with optional recipe assignment.
```typescript
interface MealEventInfo {
  identifier: string;
  calendarId: string;
  date: Date;
  details?: string;
  labelId?: string;
  label?: MealEventLabelInfo;
  logicalTimestamp?: number;
  orderAddedSortIndex?: number;
  recipeId?: string;
  recipe?: RecipeInfo;
  recipeScaleFactor?: number;
  title?: string;
  mealType?: string;
  note?: string;
}
```

### Request/Response Types

#### List Management
- `CreateListRequest` - Create new shopping list
- `AddItemRequest` - Add item to list
- `UpdateItemRequest` - Update existing item
- `CreateListResponse` - List creation result
- `AddItemResponse` - Item addition result
- `UpdateItemResponse` - Item update result
- `GetListsResponse` - Lists retrieval result

#### Recipe Management
- `CreateRecipeRequest` - Create new recipe
- `UpdateRecipeRequest` - Update existing recipe
- `ImportRecipeRequest` - Import recipe from URL
- `CreateRecipeResponse` - Recipe creation result
- `ImportRecipeResponse` - Recipe import result
- `GetRecipesResponse` - Recipes retrieval result

#### Meal Planning
- `CreateMealEventRequest` - Create meal event
- `CreateMealEventResponse` - Meal event creation result
- `GetMealEventsResponse` - Meal events retrieval result

### Service Support Types

#### `PerformanceMetrics`
Performance tracking and monitoring.
```typescript
interface PerformanceMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  cacheHits: number;
  cacheMisses: number;
  lastRequestTimestamp: number;
  requestCount: number;
  totalResponseTime: number;
  errorRate: number;
  cacheHitRate: number;
}
```

#### `CacheEntry<T>`
Generic cache entry with expiration.
```typescript
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}
```

#### `RetryOptions`
Retry behavior configuration.
```typescript
interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
}
```

## Validation Schemas

All request types have corresponding Zod validation schemas that provide runtime type checking and detailed error messages.

### List Management Schemas

#### `CreateListSchema`
```typescript
z.object({
  name: z.string().min(1, 'Name cannot be empty').max(255, 'Name too long'),
  parentId: z.string().optional(),
})
```

#### `AddItemSchema`
```typescript
z.object({
  listId: z.string().min(1, 'Identifier cannot be empty'),
  name: z.string().min(1, 'Name cannot be empty').max(255, 'Name too long'),
  details: z.string().optional(),
  quantity: z.string().optional(),
})
```

#### `UpdateItemSchema`
```typescript
z.object({
  listId: z.string().min(1, 'Identifier cannot be empty'),
  itemId: z.string().min(1, 'Identifier cannot be empty'),
  name: z.string().min(1, 'Name cannot be empty').max(255, 'Name too long').optional(),
  details: z.string().optional(),
  quantity: z.string().optional(),
  checked: z.boolean().optional(),
})
```

### Recipe Management Schemas

#### `CreateRecipeSchema`
```typescript
z.object({
  name: z.string().min(1, 'Name cannot be empty').max(255, 'Name too long'),
  note: z.string().optional(),
  sourceName: z.string().optional(),
  sourceUrl: z.string().url('Invalid URL').optional(),
  ingredients: z.array(IngredientSchema).min(1, 'At least one ingredient is required'),
  preparationSteps: z.array(z.string().min(1, 'Preparation step cannot be empty'))
    .min(1, 'At least one preparation step is required'),
  scaleFactor: z.number().positive('Must be a positive number').optional().default(1),
  rating: z.number().min(1).max(5).optional(),
  nutritionalInfo: z.string().optional(),
  cookTime: z.number().min(0, 'Must be non-negative').optional(),
  prepTime: z.number().min(0, 'Must be non-negative').optional(),
  servings: z.string().optional(),
})
```

#### `ImportRecipeSchema`
```typescript
z.object({
  url: z.string().url('Invalid URL'),
  name: z.string().min(1, 'Name cannot be empty').max(255, 'Name too long').optional(),
})
```

### Meal Planning Schemas

#### `CreateMealEventSchema`
```typescript
z.object({
  title: z.string().min(1, 'Name cannot be empty').max(255, 'Name too long'),
  date: z.string().refine(
    (date) => !isNaN(Date.parse(date)),
    'Invalid date format'
  ),
  details: z.string().optional(),
  recipeId: z.string().min(1, 'Identifier cannot be empty').optional(),
  recipeScaleFactor: z.number().positive('Must be a positive number').optional().default(1),
})
```

### Utility Schemas

#### `IngredientSchema`
```typescript
z.object({
  rawIngredient: z.string().min(1, 'Raw ingredient cannot be empty'),
  name: z.string().min(1, 'Ingredient name cannot be empty'),
  quantity: z.string().optional(),
  note: z.string().optional(),
})
```

## Validation Utilities

### `validateInput<T>(schema: ZodSchema<T>, input: unknown): T`
Generic function to validate and parse input data using any Zod schema.

```typescript
try {
  const validData = validateInput(CreateRecipeSchema, userInput);
  // Use validData safely - it's guaranteed to match the schema
} catch (error) {
  // Handle validation error with detailed messages
  console.error('Validation failed:', error.message);
}
```

### Helper Functions

#### `validateEmail(email: string): boolean`
Validates email address format using regex.

#### `validateDate(dateString: string): boolean`
Validates that a string represents a valid date.

#### `validateUrl(url: string): boolean`
Validates URL format using the URL constructor.

## Error Handling

### Validation Errors
All validation schemas provide detailed error messages that specify:
- Which field failed validation
- What the validation rule was
- Nested field paths for complex objects

### Error Message Constants
The `ValidationErrors` object provides standardized error message templates:
```typescript
const ValidationErrors = {
  REQUIRED_FIELD: (field: string) => `${field} is required`,
  INVALID_FORMAT: (field: string, format: string) => `${field} must be a valid ${format}`,
  TOO_SHORT: (field: string, min: number) => `${field} must be at least ${min} characters`,
  TOO_LONG: (field: string, max: number) => `${field} must be no more than ${max} characters`,
  INVALID_RANGE: (field: string, min: number, max: number) => `${field} must be between ${min} and ${max}`,
  INVALID_EMAIL: 'Invalid email address',
  INVALID_URL: 'Invalid URL format',
  INVALID_DATE: 'Invalid date format',
} as const;
```

## Usage Examples

### Validating a Recipe Creation
```typescript
import { CreateRecipeSchema, validateInput } from './utils/validation.js';

const recipeData = {
  name: 'Chocolate Chip Cookies',
  ingredients: [
    {
      rawIngredient: '2 cups all-purpose flour',
      name: 'flour',
      quantity: '2 cups'
    }
  ],
  preparationSteps: ['Mix ingredients', 'Bake at 350°F'],
  rating: 5
};

try {
  const validRecipe = validateInput(CreateRecipeSchema, recipeData);
  // Recipe data is now type-safe and validated
  console.log('Recipe is valid:', validRecipe.name);
} catch (error) {
  console.error('Invalid recipe data:', error.message);
}
```

### Working with Optional Fields
```typescript
// All optional fields can be omitted
const minimalItem: UpdateItemRequest = {
  listId: 'list123',
  itemId: 'item456',
  checked: true
  // name, details, quantity are optional
};

// Or explicitly set to undefined
const explicitItem: UpdateItemRequest = {
  listId: 'list123',
  itemId: 'item456',
  name: undefined,
  details: 'Updated details',
  quantity: undefined,
  checked: false
};
```

## Best Practices

1. **Always validate input data** using the appropriate schema before processing
2. **Use TypeScript types** for compile-time safety and IDE support
3. **Handle validation errors gracefully** with user-friendly messages
4. **Leverage optional fields** to allow partial updates and flexible APIs
5. **Use utility functions** for common validation patterns (email, URL, date)
6. **Test validation schemas** thoroughly with valid and invalid data

## Testing

Comprehensive test suites are provided:
- `tests/validation.test.ts` - Tests all validation schemas
- `tests/types.test.ts` - Tests type definitions and compatibility

Run tests with:
```bash
npm test
```