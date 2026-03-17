// Type definitions for AnyList MCP Server

export interface AnyListCredentials {
  email: string;
  password: string;
}

export interface AnyListConfig {
  email?: string | undefined;
  password?: string | undefined;
  credentialsFile?: string | undefined;
}

// List-related types
export interface ListInfo {
  identifier: string;
  parentId?: string;
  name: string;
  items: ItemInfo[];
}

export interface ItemInfo {
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

export interface CreateItemRequest {
  name: string;
  details?: string;
  quantity?: string;
  listId: string;
}

export interface UpdateItemRequest {
  listId: string;
  itemId: string;
  name?: string | undefined;
  details?: string | undefined;
  quantity?: string | undefined;
  checked?: boolean | undefined;
}

// Recipe-related types
export interface RecipeInfo {
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

export interface IngredientInfo {
  rawIngredient: string;
  name: string;
  quantity?: string | undefined;
  note?: string | undefined;
}

export interface CreateRecipeRequest {
  name: string;
  note?: string | undefined;
  sourceName?: string | undefined;
  sourceUrl?: string | undefined;
  ingredients: IngredientInfo[];
  preparationSteps: string[];
  scaleFactor?: number | undefined;
  rating?: number | undefined;
  nutritionalInfo?: string | undefined;
  cookTime?: number | undefined;
  prepTime?: number | undefined;
  servings?: string | undefined;
}

export interface UpdateRecipeRequest {
  name?: string | undefined;
  note?: string | undefined;
  sourceName?: string | undefined;
  sourceUrl?: string | undefined;
  ingredients?: IngredientInfo[] | undefined;
  preparationSteps?: string[] | undefined;
  scaleFactor?: number | undefined;
  rating?: number | undefined;
  nutritionalInfo?: string | undefined;
  cookTime?: number | undefined;
  prepTime?: number | undefined;
  servings?: string | undefined;
}

export interface RecipeFromUrlRequest {
  url: string;
  name?: string;
}

// Meal planning types
export interface MealEventInfo {
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

export interface MealEventLabelInfo {
  identifier: string;
  calendarId: string;
  hexColor: string;
  logicalTimestamp: number;
  name: string;
  sortIndex: number;
}

export interface CreateMealEventRequest {
  title: string;
  date: string; // ISO date string
  details?: string | undefined;
  recipeId?: string | undefined;
  recipeScaleFactor?: number | undefined;
}

export interface CreateMealEventResponse {
  success: boolean;
  event?: MealEventInfo;
  error?: string;
}

// Recipe collection types
export interface RecipeCollectionInfo {
  identifier: string;
  timestamp: number;
  name: string;
  recipeIds: string[];
}

export interface CreateRecipeCollectionRequest {
  name: string;
}

// Error types
export interface AnyListError {
  message: string;
  code?: string;
  details?: unknown;
}

// Session data type for FastMCP
export interface SessionData {
  anyListConnected: boolean;
  lastActivity: Date;
  [key: string]: unknown;
}

// MCP Tool Request/Response types

export interface CreateListRequest {
  name: string;
  parentId?: string | undefined;
}

export interface CreateListResponse {
  success: boolean;
  list?: ListInfo;
  error?: string;
}

export interface AddItemRequest {
  listId: string;
  name: string;
  details?: string | undefined;
  quantity?: string | undefined;
}

export interface AddItemResponse {
  success: boolean;
  item?: ItemInfo;
  error?: string;
}

export interface UpdateItemResponse {
  success: boolean;
  item?: ItemInfo;
  error?: string;
}

export interface CreateRecipeResponse {
  success: boolean;
  recipe?: RecipeInfo;
  error?: string;
}

export interface ImportRecipeRequest {
  url: string;
  name?: string | undefined; // Optional override for recipe name
}

export interface ImportRecipeResponse {
  success: boolean;
  recipe?: RecipeInfo;
  error?: string;
}

export interface GetListsResponse {
  success: boolean;
  lists?: ListInfo[];
  error?: string;
}

export interface GetRecipesResponse {
  success: boolean;
  recipes?: RecipeInfo[];
  error?: string;
}

export interface GetMealEventsResponse {
  success: boolean;
  events?: MealEventInfo[];
  error?: string;
}

// Tool context types
export interface ToolContext {
  session?: Record<string, unknown>;
  log: {
    debug: (message: string, data?: unknown) => void;
    info: (message: string, data?: unknown) => void;
    warn: (message: string, data?: unknown) => void;
    error: (message: string, data?: unknown) => void;
  };
  reportProgress?: (progress: { progress: number; total: number }) => Promise<void>;
  streamContent?: (content: { type: string; text: string }) => Promise<void>;
}

// Service configuration types
export interface ServiceOptions {
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

export interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

export interface RateLimitOptions {
  tokensPerSecond: number;
  maxTokens: number;
  refillIntervalMs: number;
}

export interface PerformanceMetrics {
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

export interface RequestQueueItem {
  operation: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  priority: number;
  timestamp: number;
} 