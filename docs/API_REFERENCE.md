# AnyList MCP Server - API Reference

This document provides comprehensive documentation for all Model Context Protocol (MCP) tools available in the AnyList MCP server.

## Table of Contents

- [Authentication Tools](#authentication-tools)
- [List Management Tools](#list-management-tools)
- [Recipe Management Tools](#recipe-management-tools)
- [Meal Planning Tools](#meal-planning-tools)
- [Debug and Monitoring Tools](#debug-and-monitoring-tools)
- [Security and Audit Tools](#security-and-audit-tools)
- [Parameter Types](#parameter-types)
- [Response Formats](#response-formats)

## Authentication Tools

### `anylist_auth_status`

**Description**: Check AnyList authentication status and configuration sources

**Parameters**: None

**Response**:
```json
{
  "isAuthenticated": true,
  "configSource": "environment",
  "hasEnvironmentVars": true,
  "hasCredentialsFile": false,
  "credentialsFileExists": false,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Example Usage**:
```
Check my AnyList authentication status
```

### `anylist_set_credentials`

**Description**: Set AnyList credentials for authentication

**Parameters**:
- `email` (required): Email address for AnyList account
- `password` (required): Password for AnyList account
- `saveToFile` (optional, default: true): Save credentials to file for persistence
- `credentialsFile` (optional): Custom credentials file path

**Response**:
```json
{
  "success": true,
  "message": "Credentials set and authenticated successfully",
  "credentialsSaved": true,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Example Usage**:
```
Set my AnyList credentials: email "user@example.com", password "mypassword"
```

### `anylist_clear_credentials`

**Description**: Clear stored AnyList credentials and authentication

**Parameters**:
- `removeFile` (optional, default: false): Remove credentials file from disk
- `credentialsFile` (optional): Custom credentials file path

**Example Usage**:
```
Clear my AnyList credentials and remove the credentials file
```

### `anylist_validate_config`

**Description**: Validate AnyList configuration and test authentication

**Parameters**:
- `testConnection` (optional, default: true): Test actual connection to AnyList

**Example Usage**:
```
Validate my AnyList configuration and test the connection
```

### `anylist_credentials_info`

**Description**: Get information about AnyList credentials file

**Parameters**:
- `credentialsFile` (optional): Custom credentials file path
- `checkPermissions` (optional, default: true): Check file permissions security

**Example Usage**:
```
Get information about my AnyList credentials file
```

### `anylist_fix_permissions`

**Description**: Fix AnyList credentials file permissions for security

**Parameters**:
- `credentialsFile` (optional): Custom credentials file path

**Example Usage**:
```
Fix the permissions on my AnyList credentials file
```

## List Management Tools

### `get_lists`

**Description**: Retrieve all AnyList lists with their items

**Parameters**:
- `includeItems` (optional, default: true): Include item details for each list

**Response**: Text format showing all lists with item counts and preview

**Example Usage**:
```
Show me all my AnyList lists
Get my grocery lists without showing the items
```

### `create_list`

**Description**: Create a new AnyList list

**Parameters**:
- `name` (required): Name of the new list (1-255 characters)
- `parentId` (optional): ID of parent list for nested lists

**Response**: Confirmation with list name and ID

**Example Usage**:
```
Create a new list called "Weekly Groceries"
Create a shopping list named "Party Supplies"
```

### `add_item`

**Description**: Add an item to an AnyList list

**Parameters**:
- `listId` (required): ID of the list to add the item to
- `name` (required): Name of the item (1-255 characters)
- `quantity` (optional): Quantity of the item (e.g., "2 lbs", "1 dozen")
- `details` (optional): Additional details about the item

**Response**: Confirmation with item name and details

**Example Usage**:
```
Add "milk" to my grocery list
Add "2 lbs ground beef" to list ID "abc123"
Add bread with details "whole grain" to my shopping list
```

### `update_item`

**Description**: Update an item in an AnyList list (name, quantity, details, or check/uncheck)

**Parameters**:
- `listId` (required): ID of the list containing the item
- `itemId` (required): ID of the item to update
- `name` (optional): New name for the item
- `quantity` (optional): New quantity for the item
- `details` (optional): New details for the item
- `checked` (optional): New checked status (true/false)

**Response**: Confirmation with updated item details

**Example Usage**:
```
Check off item "milk" from my grocery list
Update item ID "xyz789" to have quantity "3 boxes"
Mark item "bread" as unchecked in list "abc123"
```

### `remove_item`

**Description**: Remove an item from an AnyList list

**Parameters**:
- `listId` (required): ID of the list containing the item
- `itemId` (required): ID of the item to remove

**Response**: Confirmation of item removal

**Example Usage**:
```
Remove item "bananas" from my grocery list
Delete item ID "xyz789" from list "abc123"
```

### `toggle_item`

**Description**: Toggle the checked/unchecked status of an item

**Parameters**:
- `listId` (required): ID of the list containing the item
- `itemId` (required): ID of the item to toggle

**Response**: Confirmation with new checked status

**Example Usage**:
```
Toggle the status of "milk" in my grocery list
Switch the checked status of item "bread"
```

### `uncheck_all_items`

**Description**: Uncheck all items in an AnyList list

**Parameters**:
- `listId` (required): ID of the list to uncheck all items

**Response**: Confirmation of operation

**Example Usage**:
```
Uncheck all items in my grocery list
Reset all checked items in list "abc123"
```

### `bulk_add_items`

**Description**: Add multiple items to an AnyList list at once

**Parameters**:
- `listId` (required): ID of the list to add items to
- `items` (required): Array of items with the following structure:
  - `name` (required): Name of the item
  - `quantity` (optional): Quantity of the item
  - `details` (optional): Additional details

**Response**: Summary of successful and failed additions

**Example Usage**:
```
Add multiple items to my grocery list: milk, bread, eggs, cheese
Bulk add these items with quantities: "2 lbs apples", "1 gallon milk", "1 dozen eggs"
```

### `bulk_update_items`

**Description**: Update multiple items in an AnyList list at once

**Parameters**:
- `listId` (required): ID of the list containing the items
- `updates` (required): Array of updates with:
  - `itemId` (required): ID of the item to update
  - `name` (optional): New name
  - `quantity` (optional): New quantity
  - `details` (optional): New details
  - `checked` (optional): New checked status

**Response**: Summary of successful and failed updates

**Example Usage**:
```
Mark multiple items as checked: milk, bread, eggs
Update quantities for several items in my list
```

### `bulk_remove_items`

**Description**: Remove multiple items from an AnyList list at once

**Parameters**:
- `listId` (required): ID of the list containing the items
- `itemIds` (required): Array of item IDs to remove

**Response**: Summary of successful and failed removals

**Example Usage**:
```
Remove multiple items from my grocery list
Delete several checked items from my shopping list
```

### `bulk_toggle_items`

**Description**: Toggle the checked status of multiple items at once

**Parameters**:
- `listId` (required): ID of the list containing the items
- `itemIds` (required): Array of item IDs to toggle

**Response**: Summary of successful and failed toggles

**Example Usage**:
```
Toggle the status of multiple items in my list
Switch checked status for several items
```

### `get_list_details`

**Description**: Get detailed information about a specific AnyList list

**Parameters**:
- `listId` (required): ID of the list to get details for

**Response**: Detailed list information including checked/unchecked item breakdown

**Example Usage**:
```
Get details for my grocery list
Show me detailed information about list "abc123"
```

## Recipe Management Tools

### `get_recipes`

**Description**: Retrieve AnyList recipes with optional search filtering

**Parameters**:
- `searchTerm` (optional): Search term to filter recipes by name, ingredients, or instructions
- `includeDetails` (optional, default: true): Include detailed recipe information

**Response**: List of recipes with basic information or detailed view

**Example Usage**:
```
Show me all my recipes
Find recipes containing "chicken"
Get all recipes without details
Search for "chocolate" recipes
```

### `get_recipe`

**Description**: Get detailed information about a specific recipe

**Parameters**:
- `recipeId` (required): ID of the recipe to retrieve

**Response**: Complete recipe details including ingredients, instructions, timing, and ratings

**Example Usage**:
```
Show me the details for my lasagna recipe
Get recipe with ID "recipe123"
Display the full information for my chocolate chip cookie recipe
```

### `create_recipe`

**Description**: Create a new recipe

**Parameters**:
- `name` (required): Name of the recipe (1-255 characters)
- `ingredients` (required): Array of ingredients with:
  - `rawIngredient` (required): Full ingredient description
  - `name` (required): Ingredient name
  - `quantity` (optional): Ingredient quantity
  - `note` (optional): Additional notes
- `preparationSteps` (required): Array of preparation/instruction steps
- `note` (optional): Recipe notes or description
- `sourceName` (optional): Source name (e.g., cookbook, website)
- `sourceUrl` (optional): Source URL
- `scaleFactor` (optional, default: 1): Recipe scale factor
- `rating` (optional): Rating from 1-5
- `nutritionalInfo` (optional): Nutritional information
- `cookTime` (optional): Cook time in seconds
- `prepTime` (optional): Prep time in seconds
- `servings` (optional): Number of servings

**Response**: Confirmation with recipe name and ID

**Example Usage**:
```
Create a new recipe for chocolate chip cookies with ingredients flour, sugar, eggs and instructions
Add a recipe called "Spaghetti Carbonara" with 4 servings and 30 minute cook time
```

### `update_recipe`

**Description**: Update an existing recipe

**Parameters**:
- `recipeId` (required): ID of the recipe to update
- All other parameters are optional and match `create_recipe`

**Response**: Confirmation of recipe update

**Example Usage**:
```
Update my pasta recipe to add a note about using fresh herbs
Change the cook time for recipe "abc123" to 45 minutes
Add a rating of 5 stars to my chocolate cake recipe
```

### `delete_recipe`

**Description**: Delete a recipe

**Parameters**:
- `recipeId` (required): ID of the recipe to delete

**Response**: Confirmation of recipe deletion

**Example Usage**:
```
Delete my old meatloaf recipe
Remove recipe with ID "recipe123"
```

### `import_recipe_from_url`

**Description**: Import a recipe from a URL

**Parameters**:
- `url` (required): URL to import the recipe from
- `name` (optional): Override name for the imported recipe

**Response**: Confirmation with imported recipe details

**Example Usage**:
```
Import a recipe from https://example.com/chocolate-cake
Import recipe from this URL and name it "My Favorite Cookies"
```

### `add_recipe_to_collection`

**Description**: Add a recipe to a collection

**Parameters**:
- `recipeId` (required): ID of the recipe to add
- `collectionId` (required): ID of the collection

**Response**: Confirmation of addition to collection

**Example Usage**:
```
Add my pasta recipe to the Italian collection
Put recipe "abc123" in my desserts collection
```

## Meal Planning Tools

### `get_meal_events`

**Description**: Retrieve all meal planning events with optional filtering

**Parameters**:
- `startDate` (optional): Start date for filtering (ISO date string)
- `endDate` (optional): End date for filtering (ISO date string)
- `includeRecipes` (optional, default: true): Include recipe information

**Response**: List of meal events with dates and details

**Example Usage**:
```
Show me all my meal events
Get meal events for this week
Show meal plans from January 1st to January 7th
```

### `get_meal_events_by_date`

**Description**: Get meal events for a specific date

**Parameters**:
- `date` (required): Date to get meal events for (ISO date string)

**Response**: List of meal events for the specified date

**Example Usage**:
```
What meals do I have planned for today?
Show me meals for January 15th, 2024
Get meal events for tomorrow
```

### `create_meal_event`

**Description**: Create a new meal planning event

**Parameters**:
- `title` (required): Title of the meal event
- `date` (required): Date for the meal (ISO date string)
- `details` (optional): Additional details about the meal
- `recipeId` (optional): ID of recipe to assign to this meal
- `recipeScaleFactor` (optional, default: 1): Scale factor for the recipe

**Response**: Confirmation with meal event details

**Example Usage**:
```
Schedule "Taco Tuesday" for next Tuesday
Create a dinner event for tonight with my lasagna recipe
Plan "Family BBQ" for this Saturday
```

### `update_meal_event`

**Description**: Update an existing meal event

**Parameters**:
- `eventId` (required): ID of the meal event to update
- All other parameters are optional and match `create_meal_event`

**Response**: Confirmation of meal event update

**Example Usage**:
```
Update tonight's dinner to use my new pasta recipe
Change the meal event for Friday to "Pizza Night"
```

### `delete_meal_event`

**Description**: Delete a meal event

**Parameters**:
- `eventId` (required): ID of the meal event to delete

**Response**: Confirmation of meal event deletion

**Example Usage**:
```
Cancel the dinner planned for tomorrow
Delete the meal event for Friday night
```

### `get_weekly_meal_plan`

**Description**: Get a comprehensive weekly meal plan

**Parameters**:
- `startDate` (required): Start date for the week (ISO date string)

**Response**: Organized weekly meal plan with all events

**Example Usage**:
```
Show me my meal plan for this week
Get the weekly meal plan starting Monday
```

## Debug and Monitoring Tools

### `anylist_health_check`

**Description**: Get comprehensive system health and performance metrics

**Parameters**:
- `detailed` (optional, default: false): Include detailed metrics and diagnostics
- `includeErrors` (optional, default: true): Include recent error information
- `includePerformance` (optional, default: true): Include performance statistics

**Response**:
```json
{
  "status": "healthy",
  "uptime": 3600,
  "timestamp": "2024-01-01T12:00:00.000Z",
  "performance": {
    "averageResponseTime": 245,
    "totalRequests": 1250,
    "errorRate": 0.02
  },
  "memory": {
    "used": 45.2,
    "total": 512,
    "percentage": 8.8
  },
  "errors": {
    "recent24h": 3,
    "criticalErrors": 0
  }
}
```

**Example Usage**:
```
Check system health with detailed metrics
Get basic health status
Show me system performance statistics
```

### `anylist_debug_config`

**Description**: Configure debug mode settings and get current debug status

**Parameters**:
- `enable` (optional): Enable or disable debug mode
- `categories` (optional): Comma-separated list of debug categories to enable
- `logLevel` (optional): Set debug log level (debug, info, warn, error)
- `includeStackTrace` (optional): Enable stack traces in debug output
- `enableFunctionTracing` (optional): Enable function call tracing
- `enableMemoryTracking` (optional): Enable memory usage tracking

**Response**: Current debug configuration and status

**Example Usage**:
```
Enable debug mode for authentication
Set debug level to verbose
Show current debug configuration
Enable function tracing for troubleshooting
```

### `anylist_performance_metrics`

**Description**: Get detailed performance metrics and statistics

**Parameters**:
- `reset` (optional, default: false): Reset performance counters after retrieval
- `timeRange` (optional): Time range for metrics (1h, 24h, 7d, 30d)
- `includeMemory` (optional, default: true): Include memory usage statistics
- `includeNetworking` (optional, default: true): Include network timing metrics

**Response**: Comprehensive performance data including timing, memory, and resource usage

**Example Usage**:
```
Get performance metrics for the last 24 hours
Show memory usage statistics
Reset performance counters and get current stats
```

### `anylist_error_analysis`

**Description**: Analyze recent errors and system issues

**Parameters**:
- `timeRange` (optional, default: '24h'): Time range for error analysis
- `severity` (optional): Filter by error severity (low, medium, high, critical)
- `category` (optional): Filter by error category (auth, api, network, validation)
- `includeResolved` (optional, default: false): Include resolved/fixed errors

**Response**: Error analysis with patterns, frequencies, and recommendations

**Example Usage**:
```
Analyze critical errors from the last week
Show authentication errors from today
Get error patterns and recommendations
```

### `anylist_memory_tracking`

**Description**: Monitor memory usage and detect potential memory leaks

**Parameters**:
- `operation` (required): Operation type (snapshot, compare, analyze, cleanup)
- `snapshotName` (optional): Name for memory snapshot
- `compareWith` (optional): Name of snapshot to compare against
- `includeHeapDump` (optional, default: false): Include detailed heap information

**Response**: Memory tracking results and analysis

**Example Usage**:
```
Take a memory snapshot before processing
Compare current memory with startup snapshot
Analyze memory usage for potential leaks
```

### `anylist_system_diagnostics`

**Description**: Run comprehensive system diagnostics and checks

**Parameters**:
- `tests` (optional): Specific diagnostic tests to run (connectivity, authentication, permissions, performance)
- `includeRecommendations` (optional, default: true): Include optimization recommendations
- `verbose` (optional, default: false): Include detailed diagnostic output

**Response**: System diagnostic results with status and recommendations

**Example Usage**:
```
Run full system diagnostics
Test connectivity and authentication
Check file permissions and configuration
Get performance optimization recommendations
```

### Debug Environment Variables

Configure debug mode behavior using environment variables:

```bash
# Debug Mode Configuration
DEBUG_MODE=true                           # Enable debug features
DEBUG_LOG_LEVEL=debug                    # Set debug verbosity
DEBUG_CATEGORIES=auth,api,performance    # Enable specific categories
DEBUG_INCLUDE_STACK_TRACE=true          # Include stack traces
DEBUG_ENABLE_FUNCTION_TRACING=true      # Trace function calls
DEBUG_ENABLE_PERFORMANCE_TRACING=true   # Monitor performance
DEBUG_ENABLE_MEMORY_TRACKING=true       # Track memory usage

# Logging Configuration
LOG_LEVEL=debug                          # Overall log level
ENABLE_CONSOLE_LOGGING=true             # Console output
ENABLE_FILE_LOGGING=true                # File logging
ENABLE_PERFORMANCE_LOGGING=true         # Performance logs
ENABLE_AUDIT_LOGGING=true               # Security audit logs
```

### Debug Categories

Available debug categories for focused troubleshooting:

- **auth**: Authentication and authorization
- **api**: API calls and responses
- **database**: Data operations and queries
- **validation**: Input validation and sanitization
- **performance**: Timing and resource usage
- **memory**: Memory allocation and cleanup
- **network**: Network connectivity and requests
- **security**: Security checks and audit events
- **business_logic**: Application logic and workflows
- **system**: System-level operations and health

### Troubleshooting Tips

1. **Authentication Issues**: Enable `auth` category and check credential validation
2. **Performance Problems**: Use `performance` category and memory tracking
3. **Network Errors**: Enable `network` and `api` categories for request tracing
4. **Memory Leaks**: Use memory tracking tools and snapshots
5. **System Health**: Regular health checks and diagnostics

For more troubleshooting guidance, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Security and Audit Tools

### `security_status`

**Description**: Get comprehensive security status, audit logs, and rate limiting information

**Parameters**:
- `includeAuditLogs` (optional, default: false): Include recent security audit logs in response
- `severity` (optional): Filter audit logs by severity level (low, medium, high, critical)

**Response**:
```json
{
  "securityScore": 85,
  "status": "secure",
  "vulnerabilities": [],
  "recommendations": [
    "Consider enabling stricter rate limiting for production"
  ],
  "rateLimiting": {
    "auth": {
      "windowMs": 900000,
      "maxAttempts": 5,
      "currentRequests": 2
    },
    "api": {
      "windowMs": 60000,
      "maxAttempts": 60,
      "currentRequests": 15
    }
  },
  "auditLogCount": 45,
  "timestamp": "2024-01-01T12:00:00.000Z",
  "auditLogs": [
    {
      "timestamp": "2024-01-01T11:59:30.000Z",
      "event": "AUTHENTICATION_SUCCESS",
      "details": "User authenticated successfully",
      "severity": "low"
    }
  ]
}
```

**Example Usage**:
```
Check security status with audit logs
Get security status including critical severity logs
Show current system security score and recommendations
```

### `rate_limit_management`

**Description**: Manage rate limiting: check status, reset limits, or modify whitelist/blacklist

**Parameters**:
- `action` (optional, default: 'status'): Action to perform
  - `status`: Get current rate limiting status
  - `reset`: Reset rate limiting counters
  - `whitelist_add`: Add identifier to whitelist
  - `whitelist_remove`: Remove identifier from whitelist
  - `blacklist_add`: Add identifier to blacklist
  - `blacklist_remove`: Remove identifier from blacklist
- `identifier` (optional): Identifier for whitelist/blacklist operations (required for add/remove actions)
- `limiterType` (optional, default: 'api'): Type of rate limiter to manage (auth, api, strict)

**Response**:
```json
{
  "action": "status",
  "limiterType": "api",
  "stats": {
    "windowMs": 60000,
    "maxAttempts": 60,
    "currentRequests": 15,
    "resetTime": "2024-01-01T12:01:00.000Z",
    "whitelist": ["trusted-client-1"],
    "blacklist": ["blocked-user-1"]
  },
  "message": "Rate limiter status retrieved successfully",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

**Example Usage**:
```
Check API rate limiting status
Reset authentication rate limits
Add trusted client to API whitelist
Remove user from strict rate limiting blacklist
Check status of authentication rate limiter
```

### Security Environment Variables

Configure security features using environment variables:

```bash
# Credential Encryption
ANYLIST_ENCRYPTION_KEY=your-secure-32-character-key

# Rate Limiting Configuration  
RATE_LIMIT_AUTH_WINDOW=900000      # 15 minutes
RATE_LIMIT_AUTH_MAX=5              # 5 attempts per window
RATE_LIMIT_API_WINDOW=60000        # 1 minute
RATE_LIMIT_API_MAX=60              # 60 requests per minute
RATE_LIMIT_STRICT_WINDOW=3600000   # 1 hour
RATE_LIMIT_STRICT_MAX=10           # 10 requests per hour

# Security Audit Logging
SECURITY_AUDIT_ENABLED=true        # Enable audit logging
SECURITY_AUDIT_RETENTION=1000      # Max audit log entries
SECURITY_LOG_LEVEL=info           # Minimum log level

# Request Signing
REQUEST_SIGNING_ENABLED=true       # Enable request signatures
REQUEST_SIGNATURE_TOLERANCE=300000 # 5 minutes tolerance
```

### Security Features Overview

#### 1. Credential Encryption
- **Algorithm**: AES-256-CBC with PBKDF2 key derivation
- **Iterations**: 100,000 PBKDF2 iterations using SHA-256
- **Security**: Unique salt and IV per encryption operation
- **File Permissions**: Automatic 0o600 (owner read/write only)

#### 2. Rate Limiting Policies
- **Authentication**: 5 attempts per 15-minute window
- **API Requests**: 60 requests per minute
- **Strict Mode**: 10 requests per hour
- **Features**: Whitelist/blacklist support, exponential backoff

#### 3. Request Signing
- **Algorithm**: HMAC-SHA256 
- **Components**: Method, URL, body, timestamp, nonce
- **Validation**: 5-minute timestamp tolerance, unique nonces
- **Security**: Timing-safe signature verification

#### 4. Audit Logging
- **Events**: Authentication, security violations, rate limit exceeded
- **Severity Levels**: Low, medium, high, critical
- **Retention**: Configurable with automatic cleanup
- **Real-time Monitoring**: Security event tracking and alerting

#### 5. Input Validation
- **XSS Prevention**: Script tag and JavaScript protocol filtering
- **Format Validation**: Email, password, alphanumeric, text types
- **Length Limits**: Configurable maximum input lengths
- **Sanitization**: Automatic input cleaning and normalization

### Security Best Practices

1. **Credential Management**:
   - Always set `ANYLIST_ENCRYPTION_KEY` for encrypted storage
   - Use strong, unique encryption keys (32+ characters)
   - Regularly rotate credentials and encryption keys
   - Monitor credential file permissions

2. **Rate Limiting**:
   - Configure appropriate limits for your use case
   - Use whitelist for trusted clients
   - Monitor rate limit violations through security_status
   - Implement progressive rate limiting for repeat offenders

3. **Audit Monitoring**:
   - Regularly check security_status for vulnerabilities
   - Monitor high-severity audit events
   - Set up alerting for critical security events
   - Review audit logs for suspicious patterns

4. **Production Security**:
   - Enable all security features in production
   - Use environment variables for sensitive configuration
   - Implement proper SSL/TLS termination
   - Regular security assessments and updates

### Security Tool Integration

Security tools integrate seamlessly with the MCP system:

```
# Monitor security in natural language
Check current security status and show any critical issues
Reset rate limits for the API service  
Add this client to the authentication whitelist
Show me recent high-severity security events
```

### Troubleshooting Security Issues

Common security-related problems and solutions:

1. **Credential Encryption Issues**:
   ```
   Check security status for encryption key problems
   ```

2. **Rate Limiting Problems**:
   ```
   Check API rate limiting status
   Reset authentication rate limits if needed
   ```

3. **Audit Log Analysis**:
   ```
   Get security status including critical severity audit logs
   ```

4. **Permission Problems**:
   ```
   Fix the permissions on my AnyList credentials file
   ```

For detailed security setup and troubleshooting, see [SECURITY.md](SECURITY.md).

## Parameter Types

### Common Types

- **String**: Text value, often with length restrictions
- **Boolean**: true/false value
- **Number**: Numeric value, may have range restrictions
- **Date String**: ISO 8601 date format (e.g., "2024-01-15" or "2024-01-15T10:30:00Z")
- **Array**: List of values or objects

### Validation Rules

- **Required fields**: Must be provided and non-empty
- **Optional fields**: Can be omitted or set to undefined
- **String length**: Typically 1-255 characters for names
- **Email format**: Must be valid email address
- **URL format**: Must be valid URL with protocol
- **Date format**: Must be parseable date string
- **Number ranges**: Ratings 1-5, positive numbers for times
- **Array minimums**: At least one item required for ingredients/steps

## Response Formats

### Success Responses

All tools return responses in MCP format with `content` array containing text responses. Successful operations typically include:

- Confirmation messages
- Created/updated item details
- Lists and summaries
- Error handling for partial failures in bulk operations

### Error Responses

Error responses include:

- Clear error messages describing what went wrong
- Field-specific validation errors
- Authentication errors
- Network/service errors

### Bulk Operation Responses

Bulk operations provide detailed summaries:

```
Bulk add completed: 3 successful, 1 failed

✓ Added "milk"
✓ Added "bread" 
✓ Added "eggs"
✗ Failed to add "invalid item": Name cannot be empty
```

## Best Practices

1. **Authentication**: Always ensure authentication is set up before using list/recipe/meal tools
2. **Error Handling**: Check tool responses for error messages and handle gracefully
3. **Bulk Operations**: Use bulk tools for efficiency when working with multiple items
4. **Search**: Use search parameters to find specific recipes or filter large lists
5. **Validation**: Provide properly formatted dates, URLs, and other structured data
6. **IDs**: Store and reference list/recipe/meal event IDs for updates and operations

## Rate Limiting

The AnyList API may have rate limits. The MCP server handles retries and provides appropriate error messages if limits are exceeded.

## Security Notes

- Credentials are handled securely with appropriate file permissions
- Passwords are never logged or returned in responses
- Use credentials files instead of environment variables in production
- Regularly rotate credentials for security

For detailed authentication setup, see [AUTHENTICATION.md](AUTHENTICATION.md).
For Claude Desktop integration, see [SETUP_GUIDE.md](SETUP_GUIDE.md).