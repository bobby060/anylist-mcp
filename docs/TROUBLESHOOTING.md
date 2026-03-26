# AnyList MCP Server - Troubleshooting Guide

This guide provides solutions to common issues you might encounter when setting up and using the AnyList MCP Server.

## Table of Contents

- [Authentication Issues](#authentication-issues)
- [Connection Problems](#connection-problems)
- [Claude Desktop Integration](#claude-desktop-integration)
- [Tool Execution Errors](#tool-execution-errors)
- [Performance Issues](#performance-issues)
- [Platform-Specific Issues](#platform-specific-issues)
- [Security Issues](#security-issues)
- [Production Deployment Issues](#production-deployment-issues)
- [Test Suite Issues](#test-suite-issues)
- [Debug Mode](#debug-mode)
- [Common Error Messages](#common-error-messages)
- [Recovery Procedures](#recovery-procedures)

## Authentication Issues

### Problem: "Authentication failed" or "Invalid credentials"

**Symptoms:**
- Cannot connect to AnyList
- "Authentication failed" error messages
- Tools not working

**Diagnosis:**
```
# In Claude Desktop
Check my AnyList authentication status
```

**Solutions:**

1. **Verify credentials manually:**
   - Log into [anylist.com](https://anylist.com) with your credentials
   - Ensure email and password are correct
   - Check for any recent password changes

2. **Check environment variables:**
   ```bash
   echo $ANYLIST_EMAIL
   echo $ANYLIST_PASSWORD
   # Should not echo the actual password for security
   env | grep ANYLIST
   ```

3. **Reset credentials:**
   ```
   # In Claude Desktop
   Clear my AnyList credentials and remove the credentials file
   Set my AnyList credentials: email "your-email@example.com", password "your-password"
   ```

4. **Check credentials file:**
   ```bash
   # Verify file exists and has correct permissions
   ls -la ~/.anylist_credentials
   cat ~/.anylist_credentials  # Should show valid JSON
   
   # Fix permissions if needed
   chmod 600 ~/.anylist_credentials
   ```

### Problem: "Credentials file not found" or permission errors

**Solutions:**

1. **Create credentials file:**
   ```bash
   mkdir -p ~/.config/anylist-mcp
   echo '{"email":"your-email@example.com","password":"your-password"}' > ~/.anylist_credentials
   chmod 600 ~/.anylist_credentials
   ```

2. **Fix file permissions:**
   ```bash
   # In Claude Desktop
   Fix the permissions on my AnyList credentials file
   ```

3. **Use environment variables instead:**
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

### Problem: Two-factor authentication (2FA) issues

**Note:** The AnyList API currently has limited support for 2FA. 

**Solutions:**
1. **Disable 2FA temporarily** for API access (if possible)
2. **Use app-specific passwords** if AnyList supports them
3. **Contact AnyList support** for API access with 2FA

## Connection Problems

### Problem: Network timeouts or connection errors

**Symptoms:**
- "Connection timeout" errors
- "Network unreachable" messages
- Slow response times

**Solutions:**

1. **Check network connectivity:**
   ```bash
   ping api.anylist.com
   curl -I https://api.anylist.com
   nslookup api.anylist.com
   ```

2. **Increase timeout values:**
   ```json
   {
     "mcpServers": {
       "anylist": {
         "env": {
           "ANYLIST_TIMEOUT": "60000",
           "ANYLIST_RETRY_ATTEMPTS": "5",
           "ANYLIST_RETRY_DELAY": "2000"
         }
       }
     }
   }
   ```

3. **Check firewall/proxy settings:**
   ```bash
   # Check if corporate firewall is blocking access
   curl -v https://api.anylist.com
   
   # Test with proxy if needed
   export https_proxy=http://your-proxy:port
   ```

4. **Try different DNS servers:**
   ```bash
   # Use Google DNS
   sudo systemctl stop systemd-resolved
   echo 'nameserver 8.8.8.8' | sudo tee /etc/resolv.conf
   ```

### Problem: SSL/TLS certificate errors

**Solutions:**

1. **Update certificates:**
   ```bash
   # macOS
   brew install ca-certificates
   
   # Ubuntu/Debian
   sudo apt-get update && sudo apt-get install ca-certificates
   
   # CentOS/RHEL
   sudo yum update ca-certificates
   ```

2. **Node.js certificate issues:**
   ```bash
   # Temporary workaround (not recommended for production)
   export NODE_TLS_REJECT_UNAUTHORIZED=0
   ```

## Claude Desktop Integration

### Problem: AnyList tools not appearing in Claude Desktop

**Symptoms:**
- No AnyList tools visible
- Claude doesn't recognize AnyList commands
- MCP server not loading

**Diagnosis:**
1. **Check Claude Desktop logs:**
   - Open Claude Desktop
   - Look for error messages in the interface
   - Check system console/logs

2. **Validate configuration file:**
   ```bash
   # Check JSON syntax
   cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | jq .
   
   # Windows
   type "%APPDATA%\Claude\claude_desktop_config.json" | jq .
   
   # Linux
   cat ~/.config/Claude/claude_desktop_config.json | jq .
   ```

**Solutions:**

1. **Fix configuration file syntax:**
   ```json
   {
     "mcpServers": {
       "anylist": {
         "command": "node",
         "args": ["/absolute/path/to/anylist-mcp/dist/index.js"],
         "env": {
           "ANYLIST_EMAIL": "your-email@example.com",
           "ANYLIST_PASSWORD": "your-password"
         }
       }
     }
   }
   ```

2. **Use absolute paths:**
   ```bash
   # Find absolute path
   pwd  # In your anylist-mcp directory
   which node  # Path to node executable
   ```

3. **Test MCP server manually:**
   ```bash
   cd /path/to/anylist-mcp
   node dist/index.js
   # Should start without errors
   ```

4. **Restart Claude Desktop:**
   - Completely quit Claude Desktop
   - Wait 10 seconds
   - Restart the application

### Problem: "Command not found" or path errors

**Solutions:**

1. **Check Node.js installation:**
   ```bash
   which node
   node --version
   npm --version
   ```

2. **Use full path to node:**
   ```json
   {
     "mcpServers": {
       "anylist": {
         "command": "/usr/local/bin/node",
         "args": ["/full/path/to/anylist-mcp/dist/index.js"]
       }
     }
   }
   ```

3. **Use npx for automatic path resolution:**
   ```json
   {
     "mcpServers": {
       "anylist": {
         "command": "npx",
         "args": ["-y", "tsx", "/path/to/anylist-mcp/src/index.ts"]
       }
     }
   }
   ```

## Tool Execution Errors

### Problem: "Tool not found" or execution failures

**Solutions:**

1. **Check tool names:**
   ```
   # In Claude Desktop - use exact tool names
   Show me all my AnyList lists  # Correct
   Get my lists from AnyList     # Also works
   anylist_get_lists            # Direct tool name
   ```

2. **Verify authentication before using tools:**
   ```
   Check my AnyList authentication status
   Show me all my AnyList lists
   ```

3. **Check parameter validation:**
   ```
   # Good: Provide required parameters
   Create a new list called "Groceries"
   
   # Bad: Missing required parameters
   Create a new list
   ```

### Problem: "Validation error" or invalid parameters

**Common validation errors:**

1. **Empty or missing required fields:**
   ```
   # Bad
   Add item "" to my list
   
   # Good
   Add "milk" to my grocery list
   ```

2. **Invalid email format:**
   ```
   # Bad
   Set credentials: email "invalid-email", password "password"
   
   # Good  
   Set credentials: email "user@example.com", password "password"
   ```

3. **Invalid date format:**
   ```
   # Bad
   Create meal event for "next Tuesday"
   
   # Good
   Create meal event for "2024-01-15"
   ```

## Performance Issues

### Problem: Slow response times

**Solutions:**

1. **Enable caching:**
   ```json
   {
     "mcpServers": {
       "anylist": {
         "env": {
           "ANYLIST_ENABLE_CACHING": "true",
           "ANYLIST_CACHE_TTL": "300"
         }
       }
     }
   }
   ```

2. **Optimize network settings:**
   ```json
   {
     "env": {
       "ANYLIST_TIMEOUT": "30000",
       "ANYLIST_RETRY_ATTEMPTS": "2",
       "ANYLIST_RETRY_DELAY": "1000"
     }
   }
   ```

3. **Check system resources:**
   ```bash
   # Monitor CPU and memory usage
   top
   htop
   ps aux | grep node
   ```

### Problem: Memory leaks or high memory usage

**Solutions:**

1. **Monitor memory usage:**
   ```bash
   # Check Node.js process memory
   ps -o pid,vsz,rss,comm -p $(pgrep node)
   ```

2. **Restart the MCP server:**
   ```
   # In Claude Desktop - restart by changing configuration
   # Save config file to trigger restart
   ```

3. **Adjust memory limits:**
   ```json
   {
     "mcpServers": {
       "anylist": {
         "command": "node",
         "args": ["--max-old-space-size=512", "/path/to/dist/index.js"]
       }
     }
   }
   ```

## Platform-Specific Issues

### macOS Issues

1. **Gatekeeper blocking execution:**
   ```bash
   # Allow unsigned binaries
   sudo spctl --master-disable
   
   # Or specifically allow the node binary
   xattr -d com.apple.quarantine /usr/local/bin/node
   ```

2. **Path issues with GUI apps:**
   ```bash
   # Add to ~/.zshrc or ~/.bash_profile
   export PATH="/usr/local/bin:$PATH"
   
   # Restart Claude Desktop after updating PATH
   ```

### Windows Issues

1. **PowerShell execution policy:**
   ```powershell
   # Run as Administrator
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope LocalMachine
   ```

2. **Path separator issues:**
   ```json
   {
     "command": "node",
     "args": ["C:\\path\\to\\anylist-mcp\\dist\\index.js"]
   }
   ```

3. **WSL compatibility:**
   ```bash
   # Use WSL paths for WSL installation
   "command": "/usr/bin/node",
   "args": ["/mnt/c/path/to/anylist-mcp/dist/index.js"]
   ```

### Linux Issues

1. **Permission issues:**
   ```bash
   # Fix executable permissions
   chmod +x /path/to/anylist-mcp/dist/index.js
   
   # Fix Node.js permissions
   sudo chown -R $USER:$USER ~/.npm
   ```

2. **Missing dependencies:**
   ```bash
   # Ubuntu/Debian
   sudo apt-get install build-essential
   
   # CentOS/RHEL
   sudo yum groupinstall "Development Tools"
   ```

## Security Issues

### Problem: Credential encryption not working

**Symptoms:**
- Credentials stored in plain text
- Security warnings about unencrypted credentials
- "Encryption key not found" errors

**Solutions:**

1. **Set encryption key:**
   ```bash
   # Generate a secure encryption key
   export ANYLIST_ENCRYPTION_KEY=$(openssl rand -hex 32)
   
   # Or set manually (32+ characters)
   export ANYLIST_ENCRYPTION_KEY="your-secure-32-character-encryption-key-here"
   ```

2. **Verify encryption setup:**
   ```
   # In Claude Desktop
   Check security status including encryption settings
   Get information about my AnyList credentials file
   ```

3. **Migrate from unencrypted credentials:**
   ```
   # The system will automatically migrate when encryption key is set
   Set my AnyList credentials: email "your-email@example.com", password "your-password"
   ```

### Problem: Rate limiting errors

**Symptoms:**
- "Rate limit exceeded" messages
- "429 Too Many Requests" errors
- Temporary access blocking

**Solutions:**

1. **Check rate limit status:**
   ```
   # In Claude Desktop
   Check rate limiting status and current usage
   Show rate limiting configuration and policies
   ```

2. **Reset rate limits (if needed):**
   ```
   Reset rate limits for authentication attempts
   Reset rate limits for API requests
   ```

3. **Configure rate limiting policies:**
   ```json
   {
     "mcpServers": {
       "anylist": {
         "env": {
           "RATE_LIMIT_AUTH_WINDOW": "900000",
           "RATE_LIMIT_AUTH_MAX": "5",
           "RATE_LIMIT_API_WINDOW": "60000",
           "RATE_LIMIT_API_MAX": "60"
         }
       }
     }
   }
   ```

4. **Use whitelist for trusted IPs:**
   ```
   Add my IP address to the rate limiting whitelist
   ```

### Problem: Security audit failures

**Symptoms:**
- Security audit warnings
- Failed security checks
- Missing security headers

**Solutions:**

1. **Check security status:**
   ```
   # In Claude Desktop
   Check security status with audit logs
   Get security status including critical severity logs
   ```

2. **Enable security features:**
   ```json
   {
     "mcpServers": {
       "anylist": {
         "env": {
           "SECURITY_AUDIT_ENABLED": "true",
           "SECURITY_AUDIT_RETENTION": "1000",
           "ENABLE_ERROR_AUDIT_LOGGING": "true"
         }
       }
     }
   }
   ```

3. **Fix file permissions:**
   ```bash
   # Ensure credentials files have proper permissions
   chmod 600 ~/.anylist_credentials*
   
   # Check current permissions
   # In Claude Desktop: Get information about my AnyList credentials file
   ```

### Problem: Input validation errors

**Symptoms:**
- "Validation failed" errors
- "Invalid input detected" messages
- XSS prevention warnings

**Solutions:**

1. **Check input format:**
   ```
   # Bad: Special characters that trigger validation
   Add "item<script>" to my list
   
   # Good: Clean input
   Add "fresh milk" to my grocery list
   ```

2. **Review validation errors:**
   ```
   Check security status including validation errors
   ```

3. **Disable strict validation (not recommended for production):**
   ```json
   {
     "mcpServers": {
       "anylist": {
         "env": {
           "SECURITY_STRICT_VALIDATION": "false"
         }
       }
     }
   }
   ```

## Production Deployment Issues

### Problem: PM2 process management failures

**Symptoms:**
- Server not starting with PM2
- Process crashes and restarts
- Memory issues in production

**Solutions:**

1. **Check PM2 status:**
   ```bash
   npm run status
   pm2 status anylist-mcp-server
   pm2 logs anylist-mcp-server
   ```

2. **Restart production services:**
   ```bash
   npm run restart
   npm run reload  # Zero-downtime reload
   ```

3. **Monitor production resources:**
   ```bash
   npm run monit
   pm2 monit
   ```

4. **Fix memory issues:**
   ```bash
   # Check memory usage
   pm2 list
   
   # Increase memory limit in ecosystem.config.js
   max_memory_restart: '1G'
   ```

### Problem: Health check failures

**Symptoms:**
- Health endpoints returning 500
- "Service unhealthy" status
- Load balancer removing server from pool

**Solutions:**

1. **Test health endpoints:**
   ```bash
   # Basic health check
   npm run health-check
   curl -f http://localhost:3000/health
   
   # Detailed health check
   curl http://localhost:3000/health/detailed
   ```

2. **Check dependencies:**
   ```bash
   # Verify AnyList API connectivity
   ping api.anylist.com
   curl -I https://api.anylist.com
   ```

3. **Review system health:**
   ```
   # In Claude Desktop
   Check system health with detailed metrics
   Run full system diagnostics
   ```

### Problem: Production logging issues

**Symptoms:**
- Missing logs in production
- Log rotation not working
- Performance impact from logging

**Solutions:**

1. **Verify log configuration:**
   ```bash
   # Check log directory
   ls -la logs/
   
   # Review log rotation
   tail -f logs/combined-$(date +%Y-%m-%d).log
   ```

2. **Optimize production logging:**
   ```json
   {
     "mcpServers": {
       "anylist": {
         "env": {
           "NODE_ENV": "production",
           "LOG_LEVEL": "info",
           "ENABLE_CONSOLE_LOGGING": "false",
           "ENABLE_FILE_LOGGING": "true",
           "ENABLE_LOG_ROTATION": "true"
         }
       }
     }
   }
   ```

3. **Monitor log performance:**
   ```bash
   # Check log file sizes
   du -sh logs/*
   
   # Monitor logging performance
   # In Claude Desktop: Get performance metrics for logging operations
   ```

### Problem: SSL/TLS configuration issues

**Symptoms:**
- Certificate validation errors
- HTTPS connection failures
- Security warnings

**Solutions:**

1. **Update certificates:**
   ```bash
   # Update system certificates
   sudo apt-get update && sudo apt-get install ca-certificates
   ```

2. **Configure security headers:**
   ```json
   {
     "mcpServers": {
       "anylist": {
         "env": {
           "SECURITY_HEADERS_ENABLED": "true",
           "ENABLE_HSTS": "true",
           "ENABLE_CSP": "true"
         }
       }
     }
   }
   ```

3. **Check TLS configuration:**
   ```bash
   # Test TLS connection
   openssl s_client -connect api.anylist.com:443
   ```

## Test Suite Issues

### Problem: Test failures during CI/CD

**Symptoms:**
- Tests failing in automated builds
- Inconsistent test results
- Mock setup issues

**Solutions:**

1. **Run comprehensive test suite:**
   ```bash
   # Full test suite
   npm test
   
   # Test with coverage
   npm run test:coverage
   
   # Specific test categories
   npm test -- --grep "authentication"
   npm test -- --grep "security"
   ```

2. **Check test environment:**
   ```bash
   # Verify test dependencies
   npm run verify-env
   
   # Test environment setup
   NODE_ENV=test npm test
   ```

3. **Debug test failures:**
   ```bash
   # Run tests with verbose output
   npm test -- --reporter=verbose
   
   # Run specific failing test
   npm test -- --grep "specific test name"
   ```

### Problem: Mock integration issues

**Symptoms:**
- Mocks not working properly
- Real API calls during tests
- Test isolation problems

**Solutions:**

1. **Verify mock setup:**
   ```bash
   # Check mock configuration
   grep -r "vi.mock" tests/
   
   # Run tests in isolation
   npm test -- --no-coverage --run
   ```

2. **Reset test state:**
   ```bash
   # Clear test cache
   rm -rf node_modules/.cache
   npm test -- --no-cache
   ```

3. **Check test database:**
   ```bash
   # Reset test data
   npm run test:reset
   ```

### Problem: Performance test issues

**Symptoms:**
- Slow test execution
- Memory issues during testing
- Timeout errors

**Solutions:**

1. **Run performance tests separately:**
   ```bash
   # Resilience tests
   npm run test:resilience
   
   # Stress tests
   npm run stress-test
   
   # Chaos testing
   npm run chaos-test
   ```

2. **Optimize test performance:**
   ```bash
   # Run tests in parallel
   npm test -- --reporter=dot
   
   # Increase timeout for slow tests
   npm test -- --timeout=30000
   ```

3. **Monitor test resources:**
   ```bash
   # Check memory usage during tests
   ps aux | grep vitest
   
   # Monitor test execution
   npm test -- --reporter=verbose
   ```

### Problem: Tool metadata test failures

**Symptoms:**
- "Tool not found" in tests
- Import errors for tool-metadata.ts
- Missing tool definitions

**Solutions:**

1. **Verify tool metadata:**
   ```bash
   # Check tool metadata file
   cat src/tools/tool-metadata.ts | head -20
   
   # Verify all tools are defined
   grep -o "name: '[^']*'" src/tools/tool-metadata.ts
   ```

2. **Regenerate tool metadata:**
   ```bash
   # If metadata is missing, regenerate
   npm run build
   npm test -- --grep "metadata"
   ```

3. **Check tool registration:**
   ```bash
   # Verify tools are properly registered
   npm test -- --grep "tool registration"
   ```

## Debug Mode

The AnyList MCP Server includes comprehensive debug and monitoring capabilities to help troubleshoot issues and optimize performance.

### Enabling Debug Mode

#### 1. Environment Variables (Recommended)

Add debug configuration to your Claude Desktop config:

```json
{
  "mcpServers": {
    "anylist": {
      "env": {
        "DEBUG_MODE": "true",
        "DEBUG_LOG_LEVEL": "debug",
        "DEBUG_CATEGORIES": "auth,api,performance",
        "DEBUG_INCLUDE_STACK_TRACE": "true",
        "DEBUG_ENABLE_FUNCTION_TRACING": "true",
        "LOG_LEVEL": "debug",
        "ENABLE_CONSOLE_LOGGING": "true",
        "ENABLE_PERFORMANCE_LOGGING": "true"
      }
    }
  }
}
```

#### 2. Debug Tools (Interactive)

Use debug tools directly in Claude Desktop:

```
Enable debug mode for authentication
Check system health with detailed metrics
Get performance metrics for the last 24 hours
Configure debug settings for API calls
```

### Debug Categories

Enable specific debug categories for focused troubleshooting:

- **auth**: Authentication and credential validation
- **api**: AnyList API calls and responses
- **performance**: Timing and resource usage
- **memory**: Memory allocation and usage tracking
- **network**: Network connectivity and requests
- **security**: Security checks and audit events
- **validation**: Input validation and sanitization
- **business_logic**: Application workflow debugging
- **system**: System-level operations and health

### Debug Tools Reference

#### System Health Check
```
Check system health with detailed metrics
```
Returns: System status, uptime, performance metrics, memory usage, error rates

#### Performance Monitoring
```
Get performance metrics for the last 24 hours
Show memory usage statistics
```
Returns: Response times, request counts, memory usage, performance bottlenecks

#### Error Analysis
```
Analyze critical errors from the last week
Show authentication errors from today
```
Returns: Error patterns, frequencies, severity analysis, recommendations

#### Memory Tracking
```
Take a memory snapshot before processing
Compare current memory with startup snapshot
```
Returns: Memory usage analysis, potential leak detection, optimization suggestions

#### Debug Configuration
```
Enable debug mode for authentication
Set debug level to verbose
Show current debug configuration
```
Returns: Current debug settings and runtime configuration

### Reading Debug Output

#### Console Output Format
```
[2024-01-01T12:00:00.123Z] [DEBUG] [auth] Authentication attempt for user@example.com
[2024-01-01T12:00:00.234Z] [INFO] [api] GET /lists completed in 234ms
[2024-01-01T12:00:00.345Z] [WARN] [performance] Slow operation detected: getLists (500ms)
[2024-01-01T12:00:00.456Z] [ERROR] [network] Connection timeout to api.anylist.com
```

#### Log File Locations
```
logs/
├── combined-2024-01-01.log    # All log levels
├── error-2024-01-01.log       # Errors only
├── performance-2024-01-01.log # Performance metrics
└── audit-2024-01-01.log       # Security events
```

### Debug Scenarios

#### Authentication Issues
1. Enable auth debug category:
   ```
   Enable debug mode for authentication
   ```

2. Check authentication status:
   ```
   Check my AnyList authentication status
   ```

3. Review debug output for:
   - Credential validation attempts
   - API authentication calls
   - Token generation/validation
   - Permission checks

#### Performance Problems
1. Monitor performance metrics:
   ```
   Get performance metrics with memory tracking
   ```

2. Take memory snapshots:
   ```
   Take a memory snapshot before processing
   ```

3. Analyze for:
   - Slow API calls (>1000ms)
   - Memory usage spikes
   - Request queue buildup
   - Resource leaks

#### Network Connectivity
1. Enable network debugging:
   ```
   Configure debug settings for network and API calls
   ```

2. Run diagnostics:
   ```
   Run full system diagnostics
   ```

3. Check for:
   - DNS resolution issues
   - SSL/TLS handshake problems
   - Timeout configurations
   - Rate limiting

#### Memory Leaks
1. Enable memory tracking:
   ```
   Enable memory tracking for debugging
   ```

2. Compare snapshots:
   ```
   Compare current memory with startup snapshot
   ```

3. Look for:
   - Gradual memory increases
   - Large object accumulation
   - Unclosed resources
   - Event listener leaks

### Advanced Debugging

#### Function Tracing
Enable function call tracing to see detailed execution flow:
```json
{
  "DEBUG_ENABLE_FUNCTION_TRACING": "true"
}
```

Output includes:
- Function entry/exit points
- Parameter values (sanitized)
- Return values
- Execution timing

#### Performance Profiling
Enable performance tracing for detailed timing analysis:
```json
{
  "DEBUG_ENABLE_PERFORMANCE_TRACING": "true"
}
```

Tracks:
- Function execution times
- API call durations
- Memory allocation patterns
- CPU usage spikes

#### Custom Debug Filters
Filter debug output by category and severity:
```json
{
  "DEBUG_CATEGORIES": "auth,api",
  "DEBUG_LOG_LEVEL": "warn"
}
```

### Production Debugging

For production environments, use selective debugging:

```json
{
  "LOG_LEVEL": "info",
  "ENABLE_FILE_LOGGING": "true",
  "ENABLE_AUDIT_LOGGING": "true",
  "DEBUG_MODE": "false"
}
```

Monitor through:
- Health check endpoints
- Error analysis tools
- Performance metrics
- Audit logs

## Common Error Messages

### "ECONNREFUSED"
**Cause:** Cannot connect to AnyList API
**Solution:** Check network connectivity and firewall settings

### "ENOTFOUND"
**Cause:** DNS resolution failure
**Solution:** Check DNS settings and network connectivity

### "ETIMEDOUT"
**Cause:** Request timeout
**Solution:** Increase timeout values or check network speed

### "401 Unauthorized"
**Cause:** Invalid credentials
**Solution:** Verify and reset credentials

### "429 Too Many Requests"
**Cause:** Rate limiting
**Solution:** Reduce request frequency or implement backoff

### "MODULE_NOT_FOUND"
**Cause:** Missing dependencies
**Solution:** Run `npm install` and rebuild

### "EPERM" or "EACCES"
**Cause:** Permission errors
**Solution:** Fix file permissions or run with appropriate privileges

### "Encryption key not found"
**Cause:** Missing ANYLIST_ENCRYPTION_KEY environment variable
**Solution:** Set encryption key for credential encryption

### "Rate limit exceeded"
**Cause:** Too many requests within the rate limit window
**Solution:** Wait for rate limit reset or adjust rate limiting policies

### "Validation failed"
**Cause:** Input contains invalid characters or format
**Solution:** Check input format and remove special characters

### "Tool metadata not found"
**Cause:** Missing or corrupted tool-metadata.ts file
**Solution:** Rebuild project or regenerate tool metadata

### "PM2 process not found"
**Cause:** PM2 process not running or crashed
**Solution:** Restart PM2 processes or check ecosystem configuration

### "Health check failed"
**Cause:** Service dependencies are unavailable
**Solution:** Check network connectivity and service status

### "Security audit failed"
**Cause:** Security violation detected
**Solution:** Review security logs and fix validation issues

## Recovery Procedures

### Complete Reset

If all else fails, perform a complete reset:

1. **Stop Claude Desktop**

2. **Remove configuration:**
   ```bash
   # Backup first
   cp ~/Library/Application\ Support/Claude/claude_desktop_config.json ~/claude_config_backup.json
   
   # Remove AnyList configuration
   # Edit config file to remove anylist section
   ```

3. **Clear credentials:**
   ```bash
   rm ~/.anylist_credentials
   rm -rf ~/.config/anylist-mcp/
   ```

4. **Reinstall dependencies:**
   ```bash
   cd /path/to/anylist-mcp
   rm -rf node_modules package-lock.json
   npm cache clean --force
   npm install
   npm run build
   ```

5. **Test manually:**
   ```bash
   # Test environment setup
   npm run verify-env
   
   # Test health status
   npm run health-check
   
   # Test MCP server manually
   ANYLIST_EMAIL=your-email ANYLIST_PASSWORD=your-password node dist/index.js
   ```

6. **Reconfigure Claude Desktop:**
   - Start with minimal configuration
   - Test authentication first
   - Add tools one by one

### Quick Diagnosis and Setup

The project includes automated tools for quick diagnosis and setup:

#### Automatic Claude Desktop Setup
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

#### Environment and Health Verification
```bash
# Verify environment variables and configuration
npm run verify-env

# Check system health and dependencies
npm run health-check

# Security audit
npm run security-scan

# Test resilience and recovery
npm run test:resilience
```

#### Quick Test Commands
```bash
# Run specific test categories
npm test -- --grep "authentication"
npm test -- --grep "list operations"
npm test -- --grep "recipe management"
npm test -- --grep "security"
npm test -- --grep "performance"

# Performance testing
npm run stress-test
npm run chaos-test
```

#### Production Monitoring
```bash
# PM2 process management
npm run status        # Check PM2 status
npm run logs         # View logs
npm run restart      # Restart server
npm run stop         # Stop server
npm run reload       # Zero-downtime reload
npm run monit        # Real-time monitoring
```

### Backup and Restore

**Backup important files:**
```bash
# Configuration
cp ~/Library/Application\ Support/Claude/claude_desktop_config.json ~/backup/

# Credentials (both encrypted and unencrypted)
cp ~/.anylist_credentials ~/backup/ 2>/dev/null || true
cp ~/.anylist_credentials_encrypted ~/backup/ 2>/dev/null || true

# Custom configuration
cp /path/to/anylist-mcp/.env ~/backup/

# Security configuration
cp /path/to/anylist-mcp/.env.example ~/backup/
```

**Restore from backup:**
```bash
# Restore configuration
cp ~/backup/claude_desktop_config.json ~/Library/Application\ Support/Claude/

# Restore credentials (encrypted preferred)
cp ~/backup/.anylist_credentials_encrypted ~/ 2>/dev/null || \
cp ~/backup/.anylist_credentials ~/

# Restore environment configuration
cp ~/backup/.env /path/to/anylist-mcp/

# Verify restored configuration
npm run verify-env

# Restart Claude Desktop
```

### Getting Additional Help

If these solutions don't resolve your issue:

1. **Check the project repository** for known issues
2. **Enable debug mode** and capture logs
3. **Create a minimal reproduction case**
4. **Report the issue** with:
   - Operating system and version
   - Node.js version
   - Complete error messages
   - Debug logs
   - Steps to reproduce

Remember to **never include actual credentials** in bug reports or debug logs.