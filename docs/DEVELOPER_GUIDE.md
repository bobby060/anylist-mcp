# AnyList MCP Server - Developer Guide

This guide provides comprehensive information for developers who want to contribute to the AnyList MCP Server project or understand its internal architecture.

## Table of Contents

- [Project Architecture](#project-architecture)
- [Development Setup](#development-setup)
- [Code Structure](#code-structure)
- [Building and Testing](#building-and-testing)
- [Contributing Guidelines](#contributing-guidelines)
- [Adding New Features](#adding-new-features)
- [API Integration](#api-integration)
- [Testing Strategy](#testing-strategy)
- [Performance Considerations](#performance-considerations)

## Project Architecture

### Overview

The AnyList MCP Server is built as a Model Context Protocol (MCP) server that provides Claude and other AI assistants with the ability to interact with AnyList's grocery list, recipe, and meal planning features.

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Claude AI     │    │   MCP Server    │    │   AnyList API   │
│                 │◄──►│                 │◄──►│                 │
│ Natural Language│    │ Tool Processing │    │ Data & Actions  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Core Components

1. **MCP Server Core** (`src/index.ts`)
   - FastMCP server initialization
   - Tool registration
   - Authentication handling
   - Graceful shutdown

2. **Service Layer** (`src/services/`)
   - AnyList API wrapper and abstraction
   - Connection management
   - Data transformation

3. **Tool Implementations** (`src/tools/`)
   - MCP tool definitions
   - Parameter validation
   - Response formatting

4. **Utilities** (`src/utils/`)
   - Authentication management
   - Configuration handling
   - Validation schemas
   - Credential security

5. **Type Definitions** (`src/types/`)
   - TypeScript interfaces
   - API response types
   - Configuration types

### Technology Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **MCP Framework**: FastMCP
- **Validation**: Zod
- **Testing**: Vitest
- **Linting**: ESLint
- **API Client**: anylist npm package
- **Build**: TypeScript Compiler

## Development Setup

### Prerequisites

```bash
# Required software
node --version    # v18.0.0+
npm --version     # 8.0.0+
git --version     # 2.0.0+
```

### Initial Setup

1. **Clone and setup:**
   ```bash
   git clone https://github.com/your-username/anylist-mcp.git
   cd anylist-mcp
   npm install
   ```

2. **Environment configuration:**
   ```bash
   cp .env.example .env
   # Edit .env with your AnyList credentials
   ```

3. **Development credentials:**
   ```bash
   # Create secure test credentials
   echo '{"email":"test@example.com","password":"test-password"}' > .test_credentials
   chmod 600 .test_credentials
   ```

4. **Build and test:**
   ```bash
   npm run build
   npm run test
   npm run type-check
   npm run lint
   ```

### Development Commands

```bash
# Development server with hot reload
npm run dev

# Build for production
npm run build

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Type checking
npm run type-check

# Linting
npm run lint
npm run lint:fix

# Clean build artifacts
npm run clean
```

## Code Structure

### Directory Layout

```
src/
├── index.ts              # Main server entry point
├── services/             # Business logic layer
│   └── anylist-service.ts
├── tools/                # MCP tool implementations
│   ├── auth-tools.ts     # Authentication tools
│   ├── list-tools.ts     # List management tools
│   ├── recipe-tools.ts   # Recipe management tools
│   └── meal-tools.ts     # Meal planning tools
├── types/                # TypeScript type definitions
│   ├── anylist.d.ts      # AnyList API types
│   └── index.ts          # Exported types
└── utils/                # Utility functions
    ├── auth.ts           # Authentication management
    ├── config.ts         # Configuration handling
    ├── credentials.ts    # Secure credential storage
    └── validation.ts     # Zod validation schemas

tests/                    # Test suites
├── auth.test.ts
├── basic.test.ts
├── types.test.ts
└── validation.test.ts

docs/                     # Documentation
├── API_REFERENCE.md
├── AUTHENTICATION.md
├── DEVELOPER_GUIDE.md
├── SETUP_GUIDE.md
├── TROUBLESHOOTING.md
└── types-documentation.md
```

### Key Design Patterns

#### 1. Service Layer Pattern

The `AnyListService` class abstracts the AnyList API:

```typescript
export class AnyListService {
  private anylist: AnyList;
  
  constructor(config: AnyListConfig) {
    this.anylist = new AnyList(config);
  }
  
  async getLists(): Promise<ListInfo[]> {
    // API abstraction logic
  }
}
```

#### 2. Tool Registration Pattern

Each tool category has its own registration function:

```typescript
export function registerListTools(server: FastMCP, service: AnyListService) {
  server.addTool({
    name: 'get_lists',
    description: 'Retrieve all AnyList lists',
    parameters: GetListsSchema,
    execute: async (params) => {
      // Tool implementation
    }
  });
}
```

#### 3. Validation Schema Pattern

Zod schemas provide runtime validation:

```typescript
export const AddItemSchema = z.object({
  listId: z.string().min(1),
  name: z.string().min(1).max(255),
  quantity: z.string().optional(),
  details: z.string().optional(),
});
```

## Building and Testing

### Build Process

The build process compiles TypeScript to JavaScript:

```bash
# Development build with source maps
npm run build:dev

# Production build (optimized)
npm run build

# Watch mode for development
npm run build:watch
```

**Build Configuration** (`tsconfig.json`):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Node",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

### Testing Strategy

#### Unit Tests
Test individual functions and classes:

```typescript
describe('AnyListService', () => {
  it('should authenticate with valid credentials', async () => {
    const service = new AnyListService({
      email: 'test@example.com',
      password: 'password'
    });
    
    await expect(service.connect()).resolves.not.toThrow();
  });
});
```

#### Integration Tests
Test MCP tool functionality:

```typescript
describe('List Tools', () => {
  it('should create a new list', async () => {
    const result = await executeToolCall('create_list', {
      name: 'Test List'
    });
    
    expect(result.content[0].text).toContain('Successfully created');
  });
});
```

#### Test Configuration
**Vitest Configuration** (`vitest.config.ts`):
```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', 'tests/']
    }
  }
});
```

### Code Quality

#### ESLint Configuration
```json
{
  "extends": [
    "@typescript-eslint/recommended",
    "prettier"
  ],
  "rules": {
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/explicit-function-return-type": "warn",
    "prefer-const": "error"
  }
}
```

#### Pre-commit Hooks
```json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm run lint && npm run type-check && npm test"
    }
  }
}
```

## Contributing Guidelines

### Git Workflow

1. **Fork the repository**
2. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make changes with good commit messages:**
   ```bash
   git commit -m "feat: add bulk operations for list items"
   git commit -m "fix: handle authentication timeout errors"
   git commit -m "docs: update API reference for new tools"
   ```

4. **Ensure tests pass:**
   ```bash
   npm test
   npm run lint
   npm run type-check
   ```

5. **Push and create PR:**
   ```bash
   git push origin feature/your-feature-name
   ```

### Commit Message Format

Use conventional commits:

- `feat:` new features
- `fix:` bug fixes
- `docs:` documentation updates
- `style:` formatting changes
- `refactor:` code refactoring
- `test:` test additions/updates
- `chore:` build/tool updates

### Code Review Process

1. **All changes require review**
2. **Tests must pass**
3. **Documentation must be updated**
4. **Type safety must be maintained**
5. **Breaking changes need migration guide**

## Adding New Features

### Adding a New MCP Tool

1. **Define the tool schema:**
   ```typescript
   // In src/utils/validation.ts
   export const NewToolSchema = z.object({
     param1: z.string().min(1),
     param2: z.number().optional(),
   });
   ```

2. **Implement the tool:**
   ```typescript
   // In appropriate tool file
   server.addTool({
     name: 'new_tool',
     description: 'Description of what this tool does',
     parameters: NewToolSchema,
     execute: async (params) => {
       // Implementation
       return {
         content: [{
           type: 'text',
           text: 'Tool response'
         }]
       };
     }
   });
   ```

3. **Add tests:**
   ```typescript
   // In tests/
   describe('new_tool', () => {
     it('should handle valid input', async () => {
       // Test implementation
     });
   });
   ```

4. **Update documentation:**
   - Add to API_REFERENCE.md
   - Add usage examples
   - Update README if needed

### Adding New Service Methods

1. **Define types:**
   ```typescript
   // In src/types/
   export interface NewDataType {
     id: string;
     name: string;
     // other fields
   }
   ```

2. **Implement service method:**
   ```typescript
   // In src/services/anylist-service.ts
   async getNewData(): Promise<NewDataType[]> {
     const response = await this.anylist.someApiCall();
     return this.transformResponse(response);
   }
   ```

3. **Add validation:**
   ```typescript
   // In src/utils/validation.ts
   export const NewDataSchema = z.object({
     // validation rules
   });
   ```

### Extending Authentication

1. **Add new auth method:**
   ```typescript
   // In src/utils/auth.ts
   async authenticateWithNewMethod(config: NewAuthConfig): Promise<AuthResult> {
     // Implementation
   }
   ```

2. **Update configuration types:**
   ```typescript
   // In src/types/
   export interface AuthConfig {
     // existing fields
     newAuthMethod?: NewAuthMethodConfig;
   }
   ```

## API Integration

### AnyList API Patterns

The AnyList API uses these common patterns:

1. **Authentication:**
   ```typescript
   const anylist = new AnyList({
     email: 'user@example.com',
     password: 'password'
   });
   ```

2. **Data Fetching:**
   ```typescript
   const lists = await anylist.getLists();
   const recipes = await anylist.getRecipes();
   ```

3. **Mutations:**
   ```typescript
   const newList = await anylist.createList({ name: 'New List' });
   await anylist.addItem(listId, { name: 'Item' });
   ```

### Error Handling

Implement comprehensive error handling:

```typescript
try {
  const result = await anylist.someOperation();
  return result;
} catch (error) {
  if (error instanceof AuthenticationError) {
    throw new Error('Authentication failed. Please check credentials.');
  } else if (error instanceof NetworkError) {
    throw new Error('Network error. Please check connection.');
  } else {
    throw new Error(`Unexpected error: ${error.message}`);
  }
}
```

### Rate Limiting

Implement rate limiting for API calls:

```typescript
class RateLimiter {
  private requests: number[] = [];
  
  async checkLimit(): Promise<void> {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < 60000);
    
    if (this.requests.length >= 100) {
      throw new Error('Rate limit exceeded');
    }
    
    this.requests.push(now);
  }
}
```

## Performance Considerations

### Caching Strategy

Implement intelligent caching:

```typescript
class CacheManager {
  private cache = new Map<string, CacheEntry>();
  
  async get<T>(key: string, fetcher: () => Promise<T>, ttl = 300000): Promise<T> {
    const cached = this.cache.get(key);
    
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    
    const data = await fetcher();
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl
    });
    
    return data;
  }
}
```

### Memory Management

Monitor and manage memory usage:

```typescript
// Monitor memory usage
setInterval(() => {
  const usage = process.memoryUsage();
  if (usage.heapUsed > 100 * 1024 * 1024) { // 100MB
    console.warn('High memory usage detected');
  }
}, 30000);
```

### Async Optimization

Use proper async patterns:

```typescript
// Good: Parallel processing
const [lists, recipes, events] = await Promise.all([
  service.getLists(),
  service.getRecipes(),
  service.getMealEvents()
]);

// Good: Streaming for large datasets
async function* streamLargeDataset() {
  for (let page = 1; page <= totalPages; page++) {
    const data = await fetchPage(page);
    yield* data;
  }
}
```

## Debugging and Monitoring

The AnyList MCP Server includes a comprehensive debugging and monitoring system built on Winston logging with enhanced debug capabilities.

### Debug System Architecture

```typescript
// Core debug components
src/utils/
├── logger.ts              # Winston-based logging system
├── debug.ts               # Debug manager with categories
├── enhanced-debug.ts      # Advanced debugging features
├── error-handler.ts       # Enhanced error handling
└── performance.ts         # Performance monitoring
```

### Logging System

#### Winston Logger Configuration

```typescript
import logger, { LogCategory } from './utils/logger.js';

// Structured logging with categories
logger.info('Operation completed', { 
  operation: 'getLists',
  duration: 234,
  itemCount: 5 
}, LogCategory.API);

logger.error('Authentication failed', {
  email: 'user@example.com',
  reason: 'invalid_credentials'
}, LogCategory.AUTH);
```

#### Log Categories

- `LogCategory.SYSTEM` - System operations and startup
- `LogCategory.AUTH` - Authentication and authorization
- `LogCategory.API` - AnyList API interactions
- `LogCategory.PERFORMANCE` - Performance metrics and timing
- `LogCategory.SECURITY` - Security events and audit logs
- `LogCategory.AUDIT` - User actions and data changes
- `LogCategory.ERROR` - Error reporting and handling
- `LogCategory.DEBUG` - Development debugging

### Debug Manager

#### Category-Based Debugging

```typescript
import debugManager, { DebugCategory } from './utils/debug.js';

// Enable specific debug categories
debugManager.setConfig({
  enabled: true,
  categories: new Set([DebugCategory.AUTH, DebugCategory.API]),
  logLevel: 'debug'
});

// Debug function execution
debugManager.traceFunction(
  'authenticateUser',
  [email, '***hidden***'],
  DebugCategory.AUTH
);

// Memory tracking
debugManager.captureMemorySnapshot('before-operation');
debugManager.captureMemorySnapshot('after-operation');
debugManager.compareMemorySnapshots(
  'before-operation',
  'after-operation'
);
```

#### Object Inspection

```typescript
// Safe object inspection with depth limits
debugManager.inspectObject('userProfile', {
  id: '123',
  email: 'user@example.com',
  lists: [/* large array */]
}, DebugCategory.AUTH);

// Function call tracing
const result = debugManager.traceFunction(
  'processLists',
  [listData],
  DebugCategory.BUSINESS_LOGIC
);
```

### Enhanced Error Handling

#### Error Classification System

```typescript
import errorHandler, { ErrorType, ErrorSeverity } from './utils/error-handler.js';

// Classify and track errors
try {
  await anylistApi.authenticate();
} catch (error) {
  const enhancedError = errorHandler.createEnhancedError(
    error,
    ErrorType.AUTHENTICATION,
    ErrorSeverity.HIGH,
    'User authentication failed',
    { userId: '123', timestamp: Date.now() }
  );
  
  // Auto-reports based on severity
  errorHandler.handleError(enhancedError);
}
```

#### Error Metrics and Analysis

```typescript
// Get error statistics
const errorStats = errorHandler.getErrorStats();
console.log('Error rate:', errorStats.errorRate);
console.log('Recent errors:', errorStats.recentErrors);

// Error pattern analysis
const analysis = errorHandler.analyzeErrorPatterns(24); // last 24 hours
```

### Performance Monitoring

#### Built-in Performance Tracking

```typescript
import { PerformanceMonitor } from './utils/performance.js';

const perfMonitor = new PerformanceMonitor();

// Track operation timing
const timer = perfMonitor.startTimer('database-query');
await performDatabaseOperation();
const duration = perfMonitor.endTimer(timer);

// Memory usage tracking
perfMonitor.trackMemoryUsage('heavy-operation');
```

#### Performance Metrics Collection

```typescript
// Automatic timing for async operations
const timedOperation = perfMonitor.timeAsync(async () => {
  return await anylistService.getLists();
}, 'getLists');

// Resource monitoring
const systemMetrics = perfMonitor.getSystemMetrics();
console.log('Memory usage:', systemMetrics.memory);
console.log('CPU usage:', systemMetrics.cpu);
```

### Debug Tools for Development

#### MCP Debug Tools

The server includes debug tools accessible through MCP:

```typescript
// Health check tool
server.addTool({
  name: 'anylist_health_check',
  description: 'Get system health and performance metrics',
  parameters: z.object({
    detailed: z.boolean().default(false),
    includeErrors: z.boolean().default(true)
  }),
  execute: async ({ detailed, includeErrors }) => {
    return debugTools.getHealthStatus(detailed, includeErrors);
  }
});
```

#### Development Debugging Helpers

```typescript
// Debug middleware for development
const debugMiddleware = (req: any, res: any, next: any) => {
  if (process.env.NODE_ENV === 'development') {
    debugManager.logRequest(req);
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      debugManager.logResponse(res, duration);
    });
  }
  next();
};
```

### Environment Configuration

#### Debug Environment Variables

```bash
# Core debug settings
DEBUG_MODE=true
DEBUG_LOG_LEVEL=debug
DEBUG_CATEGORIES=auth,api,performance
DEBUG_INCLUDE_STACK_TRACE=true
DEBUG_ENABLE_FUNCTION_TRACING=true
DEBUG_ENABLE_PERFORMANCE_TRACING=true
DEBUG_ENABLE_MEMORY_TRACKING=true

# Logging configuration
LOG_LEVEL=debug
LOG_DIRECTORY=./logs
ENABLE_CONSOLE_LOGGING=true
ENABLE_FILE_LOGGING=true
ENABLE_LOG_ROTATION=true
ENABLE_PERFORMANCE_LOGGING=true
ENABLE_AUDIT_LOGGING=true

# Error handling
ENABLE_ERROR_METRICS=true
MAX_RECENT_ERRORS=100
ERROR_REPORT_THRESHOLD=high
```

#### Production vs Development

```typescript
// Conditional debug setup
const isProduction = process.env.NODE_ENV === 'production';

const debugConfig = {
  enabled: !isProduction,
  logLevel: isProduction ? 'warn' : 'debug',
  includeStackTrace: !isProduction,
  enableFunctionTracing: !isProduction && process.env.DEBUG_FUNCTION_TRACING === 'true'
};
```

### Testing Debug Features

#### Unit Testing with Debug

```typescript
import { createTestLogger } from '../test-utils/logger.js';

describe('Debug System', () => {
  let testLogger: TestLogger;
  
  beforeEach(() => {
    testLogger = createTestLogger();
    debugManager.setLogger(testLogger);
  });
  
  it('should capture debug messages', () => {
    debugManager.debug('Test message', {}, DebugCategory.SYSTEM);
    expect(testLogger.getMessages()).toContain('Test message');
  });
});
```

#### Integration Testing

```typescript
// Test debug tools through MCP interface
const healthResult = await server.executeRequest({
  method: 'tools/call',
  params: {
    name: 'anylist_health_check',
    arguments: { detailed: true }
  }
});

expect(healthResult.status).toBe('healthy');
```

### Memory Management and Debugging

#### Memory Leak Detection

```typescript
// Automatic memory monitoring
const memoryMonitor = new MemoryMonitor({
  checkInterval: 30000, // 30 seconds
  thresholdMB: 100,
  onThresholdExceeded: (usage) => {
    logger.warn('Memory threshold exceeded', usage);
    debugManager.captureMemorySnapshot('high-usage');
  }
});
```

#### Resource Cleanup

```typescript
// Ensure proper cleanup in debug mode
process.on('SIGTERM', () => {
  debugManager.cleanup();
  perfMonitor.saveMetrics();
  errorHandler.flushErrors();
});
```
  
  recordRequest(responseTime: number, success: boolean): void {
    this.metrics.totalRequests++;
    this.updateAverageResponseTime(responseTime);
    this.updateErrorRate(success);
  }
}
```

### Health Checks

Implement health check endpoints:

```typescript
server.addTool({
  name: 'health_check',
  description: 'Check server health and connectivity',
  parameters: z.object({}),
  execute: async () => {
    const checks = await Promise.all([
      checkAnyListConnectivity(),
      checkMemoryUsage(),
      checkResponseTimes()
    ]);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(checks, null, 2)
      }]
    };
  }
});
```

This developer guide provides a solid foundation for contributing to the AnyList MCP Server. For specific implementation details, refer to the source code and existing tests as examples.