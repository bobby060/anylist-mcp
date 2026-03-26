# AnyList MCP Authentication System

This document describes the secure authentication and configuration system for the AnyList MCP Server.

## Overview

The authentication system provides secure credential management with multiple configuration sources and robust validation. It supports:

- Environment variable configuration
- Secure credential file storage
- Runtime credential setting
- Multi-source configuration priority
- Comprehensive validation

## Configuration Sources

The system loads configuration from multiple sources with the following priority order:

1. **Runtime Options** - Passed directly to functions
2. **Environment Variables** - Set in shell or `.env` file
3. **Credentials File** - Stored in secure file (default: `~/.anylist_credentials`)
4. **Default Values** - Fallback configuration

### Environment Variables

Set these in your environment or `.env` file:

```bash
# Required
ANYLIST_EMAIL="your_email@example.com"
ANYLIST_PASSWORD="your_password"

# Optional
ANYLIST_CREDENTIALS_FILE="/custom/path/to/credentials"
ANYLIST_API_BASE_URL="https://api.anylist.com"
ANYLIST_TIMEOUT="30000"                  # milliseconds
ANYLIST_RETRY_ATTEMPTS="3"
ANYLIST_RETRY_DELAY="1000"              # milliseconds
```

### Credentials File

The system can store credentials in a secure file with restricted permissions:

```json
{
  "email": "your_email@example.com",
  "password": "your_password",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "lastUsed": "2024-01-01T00:00:00.000Z"
}
```

Default location: `~/.anylist_credentials`

**Security Features:**
- File permissions set to `600` (owner read/write only)
- Automatic permission validation and fixing
- Secure file creation and updates

## Usage

### Basic Authentication

```typescript
import { authManager } from './src/utils/auth.js';

// Authenticate using environment variables or credentials file
const authResult = await authManager.authenticate();

if (authResult.isAuthenticated) {
  console.log('Successfully authenticated!');
  // Use authResult.config for AnyList service
} else {
  console.error('Authentication failed:', authResult.error);
}
```

### Setting Credentials

```typescript
import { authManager } from './src/utils/auth.js';

// Set credentials directly
const authResult = await authManager.authenticate({
  email: 'your_email@example.com',
  password: 'your_password',
  saveCredentials: true // Save to credentials file
});
```

### Managing Credentials File

```typescript
import { credentialsManager } from './src/utils/credentials.js';

// Save credentials
await credentialsManager.saveCredentials({
  email: 'your_email@example.com',
  password: 'your_password'
});

// Load credentials
const credentials = await credentialsManager.loadCredentials();

// Check if credentials exist
const exists = credentialsManager.credentialsExist();

// Get file information
const info = credentialsManager.getCredentialsInfo();

// Verify file permissions
const permissions = credentialsManager.verifyCredentialsPermissions();

// Fix file permissions
await credentialsManager.fixCredentialsPermissions();
```

### Configuration Management

```typescript
import { configManager } from './src/utils/config.js';

// Load configuration from all sources
const config = await configManager.loadConfig({
  email: 'override@example.com', // Highest priority
  credentialsFile: '/custom/path'
});

// Validate configuration
const validConfig = configManager.validateConfig(someConfig);

// Save credentials
await configManager.saveCredentials({
  email: 'test@example.com',
  password: 'password'
});
```

## MCP Tools

The authentication system provides several MCP tools for managing credentials:

### `anylist_auth_status`

Check authentication status and configuration sources.

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

### `anylist_set_credentials`

Set AnyList credentials for authentication.

**Parameters:**
- `email` (required): Email address
- `password` (required): Password
- `saveToFile` (optional, default: true): Save credentials to file
- `credentialsFile` (optional): Custom credentials file path

### `anylist_clear_credentials`

Clear stored credentials and authentication.

**Parameters:**
- `removeFile` (optional, default: false): Remove credentials file
- `credentialsFile` (optional): Custom credentials file path

### `anylist_validate_config`

Validate configuration and test authentication.

**Parameters:**
- `testConnection` (optional, default: true): Test actual connection

### `anylist_credentials_info`

Get information about credentials file.

**Parameters:**
- `credentialsFile` (optional): Custom credentials file path
- `checkPermissions` (optional, default: true): Check file permissions

### `anylist_fix_permissions`

Fix credentials file permissions for security.

**Parameters:**
- `credentialsFile` (optional): Custom credentials file path

## Security Considerations

### File Permissions

Credentials files are automatically created with secure permissions (`600` - owner read/write only). The system:

- Sets secure permissions on file creation
- Validates permissions when loading files
- Provides tools to fix permissions if needed
- Warns about insecure permissions

### Environment Variables

While environment variables are supported for convenience, be aware that:

- Environment variables may be visible to other processes
- Use credentials files for production environments
- Never commit `.env` files with real credentials

### Credential Storage

The system:

- Never logs passwords or sensitive data
- Validates all inputs before processing
- Uses secure file operations
- Provides automatic cleanup options

## Error Handling

The authentication system provides detailed error messages for common issues:

- **Invalid email format**: Email validation failed
- **Missing credentials**: Required credentials not provided
- **File permission errors**: Credentials file has insecure permissions
- **Authentication failures**: Cannot authenticate with provided credentials
- **Configuration errors**: Invalid configuration structure

## Testing

Run the authentication tests:

```bash
npm test -- auth.test.ts
```

The test suite covers:

- Configuration loading from all sources
- Credentials file management
- Authentication flows
- Error handling
- Security validation
- Integration scenarios

## Troubleshooting

### Authentication Fails

1. Check credentials are correct
2. Verify environment variables are set
3. Check credentials file exists and has correct permissions
4. Validate email format
5. Check network connectivity

### Credentials File Issues

1. Check file permissions: `ls -la ~/.anylist_credentials`
2. Fix permissions: Use `anylist_fix_permissions` tool
3. Verify file format: Should be valid JSON
4. Check file location: Default is `~/.anylist_credentials`

### Configuration Priority Issues

Remember the priority order:
1. Runtime options (highest)
2. Environment variables
3. Credentials file
4. Defaults (lowest)

Use the `anylist_auth_status` tool to see which source is being used.

## Best Practices

1. **Use credentials files** for production environments
2. **Set secure permissions** on credentials files
3. **Regularly rotate credentials** for security
4. **Use environment variables** for development only
5. **Never commit credentials** to version control
6. **Monitor authentication status** in applications
7. **Handle authentication errors** gracefully
8. **Test authentication flows** thoroughly

## API Reference

See the TypeScript interfaces in:
- `src/utils/config.ts` - Configuration management
- `src/utils/auth.ts` - Authentication management
- `src/utils/credentials.ts` - Credentials management

All functions are fully typed and documented with JSDoc comments.