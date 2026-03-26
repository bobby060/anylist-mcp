# AnyList MCP Server - Setup Guide

This comprehensive guide will walk you through setting up the AnyList MCP Server for use with Claude Desktop and other MCP-compatible clients.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Claude Desktop Integration](#claude-desktop-integration)
- [Authentication Setup](#authentication-setup)
- [Testing Your Setup](#testing-your-setup)
- [Troubleshooting](#troubleshooting)
- [Advanced Configuration](#advanced-configuration)

## Prerequisites

Before you begin, ensure you have:

### Required Software
- **Node.js 18.0.0 or higher** - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js) or **yarn**
- **Git** (for cloning the repository)

### Required Accounts
- **AnyList Account** - Sign up at [anylist.com](https://anylist.com)
- **Claude Desktop** - Download from [Anthropic](https://claude.ai/desktop)

### System Requirements
- **macOS**: 10.15 or later
- **Windows**: 10 or later
- **Linux**: Most modern distributions
- **Memory**: 512MB RAM minimum
- **Storage**: 100MB available space

## Installation

### Option 1: From Source (Recommended for Development)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/anylist-mcp.git
   cd anylist-mcp
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the project:**
   ```bash
   npm run build
   ```

4. **Verify installation:**
   ```bash
   npm test
   ```

### Option 2: Using npm (Production)

```bash
# Install globally
npm install -g anylist-mcp

# Or install locally
npm install anylist-mcp
```

### Option 3: Using npx (No Installation)

You can run the server directly without installation:

```bash
npx anylist-mcp
```

## Configuration

### Environment Variables

The project includes a comprehensive `.env.example` file with all available configuration options. Copy it to create your configuration:

```bash
cp .env.example .env
```

Edit `.env` with your specific configuration. At minimum, set these required variables:

```bash
# Required for authentication
ANYLIST_EMAIL=your-email@example.com
ANYLIST_PASSWORD=your-secure-password

# Optional: Security (Recommended for production)
ANYLIST_ENCRYPTION_KEY=your-secure-32-character-encryption-key

# Optional: Logging and debugging
LOG_LEVEL=info
NODE_ENV=development
DEBUG_MODE=true
```

**Security Note**: For production deployments, always set `ANYLIST_ENCRYPTION_KEY` to enable credential encryption.

#### Complete Environment Variable Reference

See `.env.example` for the full list of available configuration options including:

- **Authentication**: Email, password, credentials file path
- **Security**: Encryption keys, rate limiting, audit logging
- **Logging**: Debug modes, log levels, file rotation
- **Performance**: Timeouts, retry policies, connection settings
- **Task Master AI**: API keys for AI-powered features

### Secure Credentials File (Recommended for Production)

The AnyList MCP server supports automatic encrypted credential storage with enterprise-grade security:

1. **Set encryption key (required for secure storage):**
   ```bash
   export ANYLIST_ENCRYPTION_KEY="your-secure-32-character-encryption-key"
   ```

2. **Use MCP tools to set credentials securely:**
   ```
   # In Claude Desktop after server is running
   Set my AnyList credentials: email "your-email@example.com", password "your-password"
   ```

3. **Verify secure storage:**
   ```
   Check my AnyList authentication status
   Get information about my AnyList credentials file
   ```

**Security Features:**
- **AES-256-CBC encryption** with PBKDF2 key derivation (100,000 iterations)
- **Automatic file permissions** (0o600 - owner read/write only)
- **Integrity verification** with SHA-256 checksums
- **Legacy migration** from unencrypted credential files

**Manual Credentials File Setup (Advanced)**

If you prefer manual setup, create an encrypted credentials file:

```bash
# The server will automatically create encrypted credentials at:
# ~/.anylist_credentials_encrypted

# Legacy unencrypted format (automatically migrated):
echo '{"email":"your-email@example.com","password":"your-password"}' > ~/.anylist_credentials
chmod 600 ~/.anylist_credentials
```

## Claude Desktop Integration

### Automatic Setup (Recommended)

The project includes automatic setup scripts for Claude Desktop integration:

```bash
# Automatic setup for development
npm run claude-setup

# Automatic setup for production
npm run claude-setup:prod

# Check current configuration status
npm run claude-status

# Remove AnyList MCP configuration
npm run claude-remove
```

The automatic setup will:
- Locate your Claude Desktop configuration file
- Add the AnyList MCP server configuration
- Use appropriate paths for your environment
- Create backup of existing configuration

### Manual Configuration

If you prefer manual setup, find your Claude Desktop configuration file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

### Configuration Methods

#### Method 1: Using Built Distribution (Recommended)

```json
{
  "mcpServers": {
    "anylist": {
      "command": "node",
      "args": ["/path/to/anylist-mcp/dist/index.js"],
      "env": {
        "ANYLIST_EMAIL": "your-email@example.com",
        "ANYLIST_PASSWORD": "your-password"
      }
    }
  }
}
```

#### Method 2: Using Development Mode

```json
{
  "mcpServers": {
    "anylist": {
      "command": "npx",
      "args": ["tsx", "/path/to/anylist-mcp/src/index.ts"],
      "env": {
        "ANYLIST_EMAIL": "your-email@example.com",
        "ANYLIST_PASSWORD": "your-password"
      }
    }
  }
}
```

#### Method 3: Using Credentials File

```json
{
  "mcpServers": {
    "anylist": {
      "command": "node",
      "args": ["/path/to/anylist-mcp/dist/index.js"],
      "env": {
        "ANYLIST_CREDENTIALS_FILE": "/path/to/your/credentials.json"
      }
    }
  }
}
```

#### Method 4: Using npx (No Local Installation)

```json
{
  "mcpServers": {
    "anylist": {
      "command": "npx",
      "args": ["-y", "anylist-mcp"],
      "env": {
        "ANYLIST_EMAIL": "your-email@example.com",
        "ANYLIST_PASSWORD": "your-password"
      }
    }
  }
}
```

### Platform-Specific Path Examples

#### macOS
```json
{
  "mcpServers": {
    "anylist": {
      "command": "node",
      "args": ["/Users/yourusername/anylist-mcp/dist/index.js"],
      "env": {
        "ANYLIST_CREDENTIALS_FILE": "/Users/yourusername/.config/anylist-mcp/credentials.json"
      }
    }
  }
}
```

#### Windows
```json
{
  "mcpServers": {
    "anylist": {
      "command": "node",
      "args": ["C:\\Users\\YourUsername\\anylist-mcp\\dist\\index.js"],
      "env": {
        "ANYLIST_CREDENTIALS_FILE": "C:\\Users\\YourUsername\\.config\\anylist-mcp\\credentials.json"
      }
    }
  }
}
```

#### Linux
```json
{
  "mcpServers": {
    "anylist": {
      "command": "node",
      "args": ["/home/yourusername/anylist-mcp/dist/index.js"],
      "env": {
        "ANYLIST_CREDENTIALS_FILE": "/home/yourusername/.config/anylist-mcp/credentials.json"
      }
    }
  }
}
```

## Authentication Setup

### Step 1: Verify AnyList Credentials

1. **Test your credentials manually:**
   ```bash
   # Using curl to test API access
   curl -X POST https://api.anylist.com/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"your-email@example.com","password":"your-password"}'
   ```

2. **Or login to AnyList web interface:**
   - Go to [anylist.com](https://anylist.com)
   - Login with your credentials
   - Verify you can access your lists

### Step 2: Configure Server Authentication

1. **Using the MCP authentication tools:**
   ```
   # In Claude Desktop after setup
   "Set my AnyList credentials: email 'your-email@example.com', password 'your-password'"
   ```

2. **Using environment variables:**
   ```bash
   export ANYLIST_EMAIL="your-email@example.com"
   export ANYLIST_PASSWORD="your-password"
   ```

3. **Using credentials file:**
   ```bash
   # Create secure credentials file
   echo '{"email":"your-email@example.com","password":"your-password"}' > ~/.anylist_credentials
   chmod 600 ~/.anylist_credentials
   ```

### Step 3: Test Authentication

```bash
# Start the server in development mode
npm run dev

# Check authentication status
# In Claude Desktop: "Check my AnyList authentication status"
```

## Testing Your Setup

### Environment Verification

Before testing functionality, verify your environment configuration:

```bash
# Verify environment variables and configuration
npm run verify-env

# Check system health and dependencies
npm run health-check

# Validate Claude Desktop configuration
npm run claude-status
```

### Basic Functionality Test

1. **Start Claude Desktop**
2. **Look for AnyList tools in the tool list**
3. **Run basic tests:**

```
# Test authentication
Check my AnyList authentication status

# Test list access
Show me all my AnyList lists

# Test basic operations
Create a test list called "Setup Test"
Add "test item" to my Setup Test list

# Test security features
Check security status with audit logs
Get security status including critical severity logs
```

### Comprehensive Test Suite

Run the automated test suite:

```bash
# Run all tests
npm test

# Run specific test categories
npm test -- --grep "authentication"
npm test -- --grep "list operations"
npm test -- --grep "recipe management"
npm test -- --grep "security"

# Run tests with coverage
npm run test:coverage

# Run resilience and performance tests
npm run test:resilience
npm run stress-test
```

### Manual Testing Checklist

**Core Functionality:**
- [ ] Authentication status check works
- [ ] Can retrieve existing lists
- [ ] Can create new lists
- [ ] Can add items to lists
- [ ] Can check/uncheck items
- [ ] Can retrieve recipes (if any exist)
- [ ] Can create simple recipes
- [ ] Can view meal events
- [ ] Error handling works for invalid inputs

**Security Features:**
- [ ] Security status check works
- [ ] Rate limiting management functions
- [ ] Encrypted credential storage works
- [ ] Audit logging is functional
- [ ] Debug and monitoring tools accessible

**Performance and Reliability:**
- [ ] Health check endpoint responds
- [ ] Performance metrics collection works
- [ ] Memory usage tracking functions
- [ ] Error recovery mechanisms active

## Troubleshooting

### Common Issues

#### 1. Authentication Errors

**Problem**: "Authentication failed" or "Invalid credentials"

**Solutions**:
- Verify credentials are correct by logging into AnyList web interface
- Check environment variables are set correctly
- Ensure credentials file has proper format and permissions
- Try clearing and resetting credentials

```bash
# Reset authentication
rm ~/.anylist_credentials
# Then reconfigure using MCP tools
```

#### 2. Claude Desktop Connection Issues

**Problem**: AnyList tools not appearing in Claude Desktop

**Solutions**:
- Verify configuration file syntax is valid JSON
- Check file paths are correct and absolute
- Ensure Node.js and npm are in your PATH
- Restart Claude Desktop after configuration changes

```bash
# Validate JSON configuration
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | jq .

# Test MCP server manually
node /path/to/anylist-mcp/dist/index.js
```

#### 3. Permission Errors

**Problem**: "Permission denied" or file access errors

**Solutions**:
```bash
# Fix credentials file permissions
chmod 600 ~/.anylist_credentials

# Fix project permissions
chmod +x /path/to/anylist-mcp/dist/index.js

# Use credentials info tool
# In Claude: "Get information about my AnyList credentials file"
```

#### 4. Network/Connection Issues

**Problem**: Timeouts or connection errors

**Solutions**:
- Check internet connection
- Verify AnyList service status
- Increase timeout values in configuration
- Check firewall/proxy settings

```bash
# Test network connectivity
ping api.anylist.com
curl -I https://api.anylist.com

# Configure longer timeouts
export ANYLIST_TIMEOUT=60000
```

#### 5. Node.js/Dependency Issues

**Problem**: Module not found or version errors

**Solutions**:
```bash
# Update Node.js to latest LTS version
nvm install --lts
nvm use --lts

# Clear npm cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install

# Rebuild the project
npm run build
```

### Debug Mode

Enable debug logging to troubleshoot issues:

```bash
# Enable debug output
export DEBUG=anylist-mcp*

# Start server with debug logging
npm run dev

# Or in Claude Desktop configuration
{
  "mcpServers": {
    "anylist": {
      "command": "node",
      "args": ["/path/to/anylist-mcp/dist/index.js"],
      "env": {
        "DEBUG": "anylist-mcp*",
        "ANYLIST_EMAIL": "your-email@example.com",
        "ANYLIST_PASSWORD": "your-password"
      }
    }
  }
}
```

### Getting Help

If you're still having issues:

1. **Check the logs:**
   - Claude Desktop logs: Console in Claude Desktop
   - Server logs: Terminal output when running in debug mode

2. **Review documentation:**
   - [API Reference](API_REFERENCE.md)
   - [Authentication Guide](AUTHENTICATION.md)
   - [Troubleshooting Guide](TROUBLESHOOTING.md)

3. **Report issues:**
   - Include error messages, logs, and configuration
   - Specify your operating system and Node.js version
   - Describe what you were trying to do when the error occurred

## Security Configuration

### Encryption Setup

For production deployments, always enable credential encryption:

```bash
# Generate a secure encryption key (32+ characters)
export ANYLIST_ENCRYPTION_KEY=$(openssl rand -hex 32)

# Or manually set a strong key
export ANYLIST_ENCRYPTION_KEY="your-secure-32-character-encryption-key-here"
```

### Rate Limiting Configuration

Configure rate limiting policies based on your use case:

```bash
# Authentication rate limiting
RATE_LIMIT_AUTH_WINDOW=900000      # 15 minutes
RATE_LIMIT_AUTH_MAX=5              # 5 attempts per window

# API rate limiting
RATE_LIMIT_API_WINDOW=60000        # 1 minute
RATE_LIMIT_API_MAX=60              # 60 requests per minute

# Strict rate limiting
RATE_LIMIT_STRICT_WINDOW=3600000   # 1 hour
RATE_LIMIT_STRICT_MAX=10           # 10 requests per hour
```

### Audit Logging Setup

Enable comprehensive security audit logging:

```bash
# Security audit configuration
SECURITY_AUDIT_ENABLED=true        # Enable audit logging
SECURITY_AUDIT_RETENTION=1000      # Max audit log entries
SECURITY_LOG_LEVEL=info            # Minimum log level
ENABLE_ERROR_AUDIT_LOGGING=true    # Enable error audit logging
```

### Production Security Checklist

Before deploying to production:

- [ ] Set `ANYLIST_ENCRYPTION_KEY` for credential encryption
- [ ] Configure appropriate rate limiting policies
- [ ] Enable audit logging with proper retention
- [ ] Set `NODE_ENV=production`
- [ ] Use secure file permissions (0o600) for all credential files
- [ ] Regularly monitor security status and audit logs
- [ ] Implement backup and recovery procedures

## Advanced Configuration

### Production Deployment

The project includes production-ready deployment scripts and process management:

```bash
# Production build with optimization
npm run build:prod

# Start with PM2 process manager
npm run start:prod

# Process management
npm run status        # Check PM2 status
npm run logs         # View logs
npm run restart      # Restart server
npm run stop         # Stop server
npm run reload       # Zero-downtime reload
npm run monit        # Real-time monitoring
```

### Performance Monitoring

Enable comprehensive monitoring for production:

```bash
# Health check endpoint
curl http://localhost:3000/health

# Performance metrics
npm run health-check

# Security audit
npm run security-scan

# Load testing
npm run stress-test
```

### Development vs Production

Key differences between development and production setups:

#### Development Configuration
```bash
# Development environment
NODE_ENV=development
DEBUG_MODE=true
LOG_LEVEL=debug
ENABLE_CONSOLE_LOGGING=true
ENABLE_FILE_LOGGING=true

# Development startup
npm run dev
```

#### Production Configuration
```bash
# Production environment
NODE_ENV=production
DEBUG_MODE=false
LOG_LEVEL=info
ENABLE_CONSOLE_LOGGING=false
ENABLE_FILE_LOGGING=true
ANYLIST_ENCRYPTION_KEY=your-secure-32-character-key

# Production startup with PM2
npm run start:prod
```

#### Production Security Requirements
- **Encryption**: Always set `ANYLIST_ENCRYPTION_KEY` 
- **Credentials**: Use encrypted credential files only
- **Logging**: Disable debug logging, enable audit logging
- **Process Management**: Use PM2 or similar for process monitoring
- **Monitoring**: Enable health checks and performance metrics
- **File Permissions**: Ensure secure file permissions (0o600)

#### Production Monitoring
```bash
# Health check endpoint
curl http://localhost:3000/health

# PM2 monitoring
pm2 status
pm2 logs
pm2 monit

# Performance metrics
npm run health-check
```

### Custom Configuration

Create a custom configuration file:

```json
{
  "anylist": {
    "apiBaseUrl": "https://api.anylist.com",
    "timeout": 30000,
    "retryAttempts": 3,
    "retryDelay": 1000,
    "enableCaching": true,
    "cacheSettings": {
      "defaultTtl": 300,
      "maxEntries": 1000
    },
    "enableMetrics": true,
    "enableRateLimit": true,
    "rateLimitConfig": {
      "windowMs": 60000,
      "maxRequests": 100
    }
  }
}
```

### Multiple Environment Setup

Set up different configurations for development and production:

```bash
# Development
cp .env.example .env.development
# Edit development settings

# Production  
cp .env.example .env.production
# Edit production settings

# Load appropriate environment
export NODE_ENV=production
```

### Security Hardening

1. **Secure credentials storage:**
   ```bash
   # Use system keychain (macOS)
   security add-generic-password -a anylist-mcp -s anylist-api -w "your-password"
   
   # Use encrypted credentials file
   gpg --cipher-algo AES256 --compress-algo 1 --s2k-cipher-algo AES256 --s2k-digest-algo SHA512 --s2k-mode 3 --s2k-count 65536 --symmetric credentials.json
   ```

2. **File permissions:**
   ```bash
   chmod 700 ~/.config/anylist-mcp/
   chmod 600 ~/.config/anylist-mcp/credentials.json
   ```

3. **Network security:**
   - Use HTTPS only
   - Configure firewall rules
   - Monitor access logs

This completes the comprehensive setup guide. The server should now be properly configured and ready for use with Claude Desktop or other MCP clients.