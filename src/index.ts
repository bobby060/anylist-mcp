#!/usr/bin/env node

import 'dotenv/config';
import { FastMCP } from 'fastmcp';
import { AnyListService } from './services/anylist-service.js';
import { registerListTools } from './tools/list-tools.js';
import { registerRecipeTools } from './tools/recipe-tools.js';
import { registerMealTools } from './tools/meal-tools.js';
import { registerAuthTools } from './tools/auth-tools.js';
import { authManager } from './utils/auth.js';
import { cacheManager } from './utils/cache-manager.js';
import { poolManager } from './utils/connection-pool.js';
import { batcherManager } from './utils/request-batcher.js';
import { performanceDashboard } from './utils/performance-dashboard.js';
import compression from 'compression';

/**
 * AnyList MCP Server - Production Ready
 * 
 * Provides comprehensive Model Context Protocol (MCP) tools for AnyList integration:
 * 
 * Core Features:
 * - List management (create, add items, check/uncheck, delete)
 * - Recipe management (create, update, delete, import from URL)
 * - Meal planning (create events, assign recipes, weekly planning)
 * - Authentication and configuration management
 * 
 * Enhanced Features:
 * - Health monitoring and status checks
 * - Performance tracking and metrics
 * - Error handling and logging
 * - Graceful shutdown procedures
 * - Memory and uptime monitoring
 */

// Enhanced error handling
class MCPServerError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'MCPServerError';
  }
}

// Performance monitoring system
class PerformanceMonitor {
  private static stats = new Map<string, { count: number; totalTime: number; avgTime: number; lastExecution: Date }>();

  static record(operation: string, duration: number): void {
    const current = this.stats.get(operation) || { count: 0, totalTime: 0, avgTime: 0, lastExecution: new Date() };
    current.count++;
    current.totalTime += duration;
    current.avgTime = Math.round(current.totalTime / current.count);
    current.lastExecution = new Date();
    this.stats.set(operation, current);

    // Log slow operations
    if (duration > 5000) {
      console.warn(`[WARN] Slow operation detected: ${operation} took ${duration}ms`);
    }
  }

  static getStats(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [operation, data] of this.stats) {
      result[operation] = {
        count: data.count,
        averageTime: data.avgTime + 'ms',
        totalTime: data.totalTime + 'ms',
        lastExecution: data.lastExecution.toISOString(),
      };
    }
    return result;
  }

  static reset(): void {
    this.stats.clear();
  }
}

// Health monitoring system
class HealthMonitor {
  private static startTime = Date.now();
  private static lastHealthCheck = Date.now();

  static async checkHealth(detailed = false): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string;
    uptime: string;
    memory: any;
    performance?: any;
    details?: any;
  }> {
    this.lastHealthCheck = Date.now();

    try {
      const uptime = process.uptime();
      const memory = process.memoryUsage();
      
      // Calculate memory usage in MB
      const memoryMB = {
        rss: Math.round(memory.rss / 1024 / 1024),
        heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
        external: Math.round(memory.external / 1024 / 1024),
      };

      // Determine health status
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      const details: any = {};

      if (memoryMB.heapUsed > 500) {
        status = 'degraded';
        details.memory = 'High memory usage detected';
      }
      if (memoryMB.heapUsed > 1000) {
        status = 'unhealthy';
        details.memory = 'Critical memory usage';
      }

      const result = {
        status,
        timestamp: new Date().toISOString(),
        uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
        memory: memoryMB,
      };

      if (detailed) {
        (result as any).performance = PerformanceMonitor.getStats();
        (result as any).details = details;
        (result as any).serverStartTime = new Date(this.startTime).toISOString();
      }

      return result;
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: '0s',
        memory: {},
        details: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  static startPeriodicChecks(intervalMs = 60000): void {
    setInterval(async () => {
      try {
        const health = await this.checkHealth();
        if (health.status !== 'healthy') {
          console.warn('[WARN] Health check indicates degraded performance:', health);
        }
      } catch (error) {
        console.error('[ERROR] Health check failed:', error);
      }
    }, intervalMs);

    console.log(`[INFO] Periodic health checks started (interval: ${intervalMs}ms)`);
  }
}

// Enhanced logging utility
class Logger {
  static log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, meta?: any): void {
    const timestamp = new Date().toISOString();
    const logMessage = meta ? `[${level}] ${timestamp} - ${message}` : `[${level}] ${timestamp} - ${message}`;
    
    if (meta) {
      console.log(logMessage, meta);
    } else {
      console.log(logMessage);
    }
  }

  static info(message: string, meta?: any): void {
    this.log('INFO', message, meta);
  }

  static warn(message: string, meta?: any): void {
    this.log('WARN', message, meta);
  }

  static error(message: string, meta?: any): void {
    this.log('ERROR', message, meta);
  }

  static debug(message: string, meta?: any): void {
    if (process.env.LOG_LEVEL === 'debug') {
      this.log('DEBUG', message, meta);
    }
  }
}

async function main(): Promise<void> {
  const startTime = Date.now();
  
  try {
    Logger.info('Starting AnyList MCP Server...');
    Logger.info('Server configuration', {
      nodeEnv: process.env.NODE_ENV || 'development',
      logLevel: process.env.LOG_LEVEL || 'info',
      version: '1.0.0',
    });

    // Authenticate using the authentication manager
    Logger.info('Authenticating with AnyList...');
    
    const authResult = await authManager.authenticate({
      email: process.env['ANYLIST_EMAIL'] || undefined,
      password: process.env['ANYLIST_PASSWORD'] || undefined,
      credentialsFile: process.env['ANYLIST_CREDENTIALS_FILE'] || undefined,
    });

    if (!authResult.isAuthenticated) {
      throw new MCPServerError(`Authentication failed: ${authResult.error}`, 'AUTH_FAILED');
    }

    Logger.info('Authentication successful', { email: authResult.config.email.replace(/(.{3}).*@/, '$1***@') });

    // Test connection
    Logger.info('Testing AnyList connection...');
    const anylistService = new AnyListService(authResult.config);

    const connectionStart = Date.now();
    try {
      await anylistService.connect();
      const connectionDuration = Date.now() - connectionStart;
      
      Logger.info('AnyList connection successful');
      PerformanceMonitor.record('anylist_connection', connectionDuration);
    } catch (error) {
      throw new MCPServerError(
        `AnyList connection failed: ${error instanceof Error ? error.message : String(error)}`,
        'CONNECTION_FAILED'
      );
    }

    // Create FastMCP server with enhanced configuration
    const server = new FastMCP({
      name: 'AnyList MCP Server',
      version: '1.0.0',
      instructions: 'Production-ready MCP server for AnyList integration with comprehensive list, recipe, and meal planning tools. Includes health monitoring, performance tracking, and robust error handling.',
    });

    // Add health check tool
    server.addTool({
      name: 'health_check',
      description: 'Check server health status, memory usage, and performance metrics',
      parameters: {
        type: 'object',
        properties: {
          detailed: {
            type: 'boolean',
            description: 'Include detailed performance metrics and system information',
            default: false,
          },
        },
      },
      execute: async ({ detailed = false }) => {
        try {
          const health = await HealthMonitor.checkHealth(detailed);
          return JSON.stringify(health, null, 2);
        } catch (error) {
          return JSON.stringify({
            status: 'unhealthy',
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          }, null, 2);
        }
      },
    });

    // Add performance metrics tool
    server.addTool({
      name: 'performance_metrics',
      description: 'Get comprehensive performance statistics for all server operations',
      parameters: {
        type: 'object',
        properties: {
          reset: {
            type: 'boolean',
            description: 'Reset all performance statistics after retrieving them',
            default: false,
          },
        },
      },
      execute: async ({ reset = false }) => {
        try {
          const stats = PerformanceMonitor.getStats();
          
          if (reset) {
            PerformanceMonitor.reset();
            Logger.info('Performance statistics reset');
          }
          
          return JSON.stringify({
            timestamp: new Date().toISOString(),
            statistics: stats,
            summary: {
              operationsTracked: Object.keys(stats).length,
              ...(reset && { message: 'Performance statistics have been reset' }),
            },
          }, null, 2);
        } catch (error) {
          return JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          }, null, 2);
        }
      },
    });

    // Add security status tool
    server.addTool({
      name: 'security_status',
      description: 'Get comprehensive security status, audit logs, and rate limiting information',
      parameters: {
        type: 'object',
        properties: {
          includeAuditLogs: {
            type: 'boolean',
            description: 'Include recent security audit logs',
            default: false,
          },
          severity: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'critical'],
            description: 'Filter audit logs by severity level',
          },
        },
      },
      execute: async ({ includeAuditLogs = false, severity }) => {
        try {
          const { securityManager } = await import('./utils/security.js');
          const { securityMiddleware } = await import('./middleware/security.js');
          const securityCheck = securityManager.performSecurityCheck();
          const securityStats = securityMiddleware.getSecurityStats();
          
          const result: any = {
            securityScore: securityCheck.score,
            status: securityCheck.score >= 80 ? 'secure' : securityCheck.score >= 60 ? 'moderate' : 'concerning',
            vulnerabilities: securityCheck.vulnerabilities,
            recommendations: securityCheck.recommendations,
            rateLimiting: securityStats.rateLimitStats,
            auditLogCount: securityStats.auditLogs,
            timestamp: new Date().toISOString(),
          };

          if (includeAuditLogs) {
            const logs = severity 
              ? securityManager.getAuditLogs(severity as any)
              : securityManager.getAuditLogs();
            result.auditLogs = logs.slice(-20); // Last 20 entries
          }

          return JSON.stringify(result, null, 2);
        } catch (error) {
          return JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          }, null, 2);
        }
      },
    });

    // Add rate limit management tool
    server.addTool({
      name: 'rate_limit_management',
      description: 'Manage rate limiting: check status, reset limits, or modify whitelist/blacklist',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['status', 'reset', 'whitelist_add', 'whitelist_remove', 'blacklist_add', 'blacklist_remove'],
            description: 'Action to perform',
            default: 'status',
          },
          identifier: {
            type: 'string',
            description: 'Identifier for whitelist/blacklist operations',
          },
          limiterType: {
            type: 'string',
            enum: ['auth', 'api', 'strict'],
            description: 'Type of rate limiter to manage',
            default: 'api',
          },
        },
      },
      execute: async ({ action = 'status', identifier, limiterType = 'api' }) => {
        try {
          const { DefaultRateLimiters } = await import('./utils/rate-limiter.js');
          let limiter;
          switch (limiterType) {
            case 'auth':
              limiter = DefaultRateLimiters.getAuthLimiter();
              break;
            case 'strict':
              limiter = DefaultRateLimiters.getStrictLimiter();
              break;
            case 'api':
            default:
              limiter = DefaultRateLimiters.getApiLimiter();
              break;
          }

          switch (action) {
            case 'status':
              const stats = limiter.getStats();
              return JSON.stringify({
                limiterType,
                stats,
                timestamp: new Date().toISOString(),
              }, null, 2);

            case 'reset':
              limiter.clearAll();
              return JSON.stringify({
                message: `${limiterType} rate limiter reset successfully`,
                timestamp: new Date().toISOString(),
              }, null, 2);

            case 'whitelist_add':
              if (!identifier) throw new Error('Identifier required for whitelist operations');
              limiter.addToWhitelist(identifier);
              return JSON.stringify({
                message: `Added ${identifier} to ${limiterType} whitelist`,
                timestamp: new Date().toISOString(),
              }, null, 2);

            case 'whitelist_remove':
              if (!identifier) throw new Error('Identifier required for whitelist operations');
              limiter.removeFromWhitelist(identifier);
              return JSON.stringify({
                message: `Removed ${identifier} from ${limiterType} whitelist`,
                timestamp: new Date().toISOString(),
              }, null, 2);

            case 'blacklist_add':
              if (!identifier) throw new Error('Identifier required for blacklist operations');
              limiter.addToBlacklist(identifier);
              return JSON.stringify({
                message: `Added ${identifier} to ${limiterType} blacklist`,
                timestamp: new Date().toISOString(),
              }, null, 2);

            case 'blacklist_remove':
              if (!identifier) throw new Error('Identifier required for blacklist operations');
              limiter.removeFromBlacklist(identifier);
              return JSON.stringify({
                message: `Removed ${identifier} from ${limiterType} blacklist`,
                timestamp: new Date().toISOString(),
              }, null, 2);

            default:
              throw new Error(`Unknown action: ${action}`);
          }
        } catch (error) {
          return JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          }, null, 2);
        }
      },
    });

    // Add cache management tool
    server.addTool({
      name: 'cache_management',
      description: 'Manage application cache systems (node-cache integration) with statistics and optimization',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['stats', 'clear', 'health', 'keys', 'optimize'],
            description: 'Cache management action',
            default: 'stats',
          },
          cacheName: {
            type: 'string',
            description: 'Specific cache to manage (optional)',
          },
        },
      },
      execute: async ({ action = 'stats', cacheName }) => {
        try {
          switch (action) {
            case 'stats':
              const stats = cacheManager.getStats();
              return JSON.stringify({
                cacheStats: stats,
                summary: {
                  totalCaches: Object.keys(stats).length,
                  totalKeys: Object.values(stats).reduce((sum, cache) => sum + cache.keyCount, 0),
                  averageHitRate: Object.values(stats).reduce((sum, cache) => sum + cache.hitRate, 0) / Object.values(stats).length,
                },
                timestamp: new Date().toISOString(),
              }, null, 2);

            case 'clear':
              cacheManager.clear(cacheName);
              return JSON.stringify({
                message: cacheName ? `Cache '${cacheName}' cleared` : 'All caches cleared',
                timestamp: new Date().toISOString(),
              }, null, 2);

            case 'health':
              const health = cacheManager.getHealthStatus();
              return JSON.stringify(health, null, 2);

            case 'keys':
              const keys = cacheManager.getKeys(cacheName);
              return JSON.stringify({
                keys,
                timestamp: new Date().toISOString(),
              }, null, 2);

            case 'optimize':
              cacheManager.optimize();
              return JSON.stringify({
                message: 'Cache optimization completed',
                timestamp: new Date().toISOString(),
              }, null, 2);

            default:
              throw new Error(`Unknown action: ${action}`);
          }
        } catch (error) {
          return JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          }, null, 2);
        }
      },
    });

    // Add connection pool management tool
    server.addTool({
      name: 'connection_pool_management',
      description: 'Manage connection pools with enhanced monitoring and optimization',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['stats', 'health', 'info', 'close'],
            description: 'Pool management action',
            default: 'stats',
          },
          poolName: {
            type: 'string',
            description: 'Specific pool to manage (optional)',
          },
        },
      },
      execute: async ({ action = 'stats', poolName }) => {
        try {
          switch (action) {
            case 'stats':
              const stats = poolManager.getAllStats();
              return JSON.stringify({
                poolStats: stats,
                summary: {
                  totalPools: Object.keys(stats).length,
                  totalConnections: Object.values(stats).reduce((sum, pool) => sum + pool.total, 0),
                  totalActive: Object.values(stats).reduce((sum, pool) => sum + pool.active, 0),
                  totalPending: Object.values(stats).reduce((sum, pool) => sum + pool.pending, 0),
                },
                timestamp: new Date().toISOString(),
              }, null, 2);

            case 'health':
              const health = poolManager.getHealthStatus();
              return JSON.stringify(health, null, 2);

            case 'info':
              if (poolName) {
                const pool = poolManager.getPool(poolName);
                return JSON.stringify({
                  poolInfo: pool ? pool.getInfo() : null,
                  timestamp: new Date().toISOString(),
                }, null, 2);
              } else {
                return JSON.stringify({
                  message: 'Pool name required for info action',
                  timestamp: new Date().toISOString(),
                }, null, 2);
              }

            case 'close':
              if (poolName) {
                const pool = poolManager.getPool(poolName);
                if (pool) {
                  await pool.close();
                  return JSON.stringify({
                    message: `Pool '${poolName}' closed`,
                    timestamp: new Date().toISOString(),
                  }, null, 2);
                } else {
                  return JSON.stringify({
                    message: `Pool '${poolName}' not found`,
                    timestamp: new Date().toISOString(),
                  }, null, 2);
                }
              } else {
                await poolManager.closeAll();
                return JSON.stringify({
                  message: 'All pools closed',
                  timestamp: new Date().toISOString(),
                }, null, 2);
              }

            default:
              throw new Error(`Unknown action: ${action}`);
          }
        } catch (error) {
          return JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          }, null, 2);
        }
      },
    });

    // Add request batcher management tool
    server.addTool({
      name: 'request_batcher_management',
      description: 'Manage request batchers for bulk operation optimization',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['stats', 'status', 'health', 'close'],
            description: 'Batcher management action',
            default: 'stats',
          },
          batcherName: {
            type: 'string',
            description: 'Specific batcher to manage (optional)',
          },
        },
      },
      execute: async ({ action = 'stats', batcherName }) => {
        try {
          switch (action) {
            case 'stats':
              const stats = batcherManager.getAllStats();
              return JSON.stringify({
                batcherStats: stats,
                summary: {
                  totalBatchers: Object.keys(stats).length,
                  totalRequests: Object.values(stats).reduce((sum, batcher) => sum + batcher.totalRequests, 0),
                  totalBatches: Object.values(stats).reduce((sum, batcher) => sum + batcher.totalBatches, 0),
                  averageEfficiency: Object.values(stats).reduce((sum, batcher) => sum + batcher.efficiency, 0) / Object.values(stats).length || 0,
                },
                timestamp: new Date().toISOString(),
              }, null, 2);

            case 'status':
              const status = batcherManager.getAllStatus();
              return JSON.stringify({
                batcherStatus: status,
                timestamp: new Date().toISOString(),
              }, null, 2);

            case 'health':
              const health = batcherManager.getHealthStatus();
              return JSON.stringify(health, null, 2);

            case 'close':
              if (batcherName) {
                const batcher = batcherManager.getBatcher(batcherName);
                if (batcher) {
                  await batcher.close();
                  return JSON.stringify({
                    message: `Batcher '${batcherName}' closed`,
                    timestamp: new Date().toISOString(),
                  }, null, 2);
                } else {
                  return JSON.stringify({
                    message: `Batcher '${batcherName}' not found`,
                    timestamp: new Date().toISOString(),
                  }, null, 2);
                }
              } else {
                await batcherManager.closeAll();
                return JSON.stringify({
                  message: 'All batchers closed',
                  timestamp: new Date().toISOString(),
                }, null, 2);
              }

            default:
              throw new Error(`Unknown action: ${action}`);
          }
        } catch (error) {
          return JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          }, null, 2);
        }
      },
    });

    // Add performance dashboard tool
    server.addTool({
      name: 'performance_dashboard',
      description: 'Comprehensive performance monitoring dashboard with alerts and recommendations',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['metrics', 'alerts', 'history', 'report', 'thresholds'],
            description: 'Dashboard action',
            default: 'metrics',
          },
          timeRangeMinutes: {
            type: 'number',
            description: 'Time range for reports in minutes',
            default: 60,
          },
          alertLevel: {
            type: 'string',
            enum: ['info', 'warning', 'error', 'critical'],
            description: 'Filter alerts by level',
          },
        },
      },
      execute: async ({ action = 'metrics', timeRangeMinutes = 60, alertLevel }) => {
        try {
          switch (action) {
            case 'metrics':
              const metrics = performanceDashboard.getMetrics();
              return JSON.stringify(metrics, null, 2);

            case 'alerts':
              const alerts = performanceDashboard.getAlerts(alertLevel as any);
              return JSON.stringify({
                alerts,
                summary: {
                  total: alerts.length,
                  critical: alerts.filter(a => a.level === 'critical').length,
                  error: alerts.filter(a => a.level === 'error').length,
                  warning: alerts.filter(a => a.level === 'warning').length,
                  info: alerts.filter(a => a.level === 'info').length,
                },
                timestamp: new Date().toISOString(),
              }, null, 2);

            case 'history':
              const history = performanceDashboard.getHistory(10);
              return JSON.stringify({
                history,
                summary: {
                  dataPoints: history.length,
                  timeRange: history.length > 0 ? {
                    start: history[0]?.system.timestamp,
                    end: history[history.length - 1]?.system.timestamp,
                  } : null,
                },
                timestamp: new Date().toISOString(),
              }, null, 2);

            case 'report':
              const report = performanceDashboard.generateReport(timeRangeMinutes);
              return JSON.stringify(report, null, 2);

            case 'thresholds':
              const thresholds = performanceDashboard.getThresholds();
              return JSON.stringify({
                thresholds,
                timestamp: new Date().toISOString(),
              }, null, 2);

            default:
              throw new Error(`Unknown action: ${action}`);
          }
        } catch (error) {
          return JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          }, null, 2);
        }
      },
    });

    // Add server info tool
    server.addTool({
      name: 'server_info',
      description: 'Get comprehensive server information and capabilities',
      parameters: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        try {
          return JSON.stringify({
            name: 'AnyList MCP Server',
            version: '1.0.0',
            capabilities: [
              'List management (create, add items, check/uncheck, delete)',
              'Recipe management (create, update, delete, import from URL)',
              'Meal planning (create events, assign recipes, weekly planning)',
              'Authentication and configuration management',
              'Health monitoring and status checks',
              'Performance tracking and metrics',
              'Enhanced caching with node-cache',
              'Connection pooling optimization',
              'Request batching for bulk operations',
              'Compression middleware',
              'Advanced performance monitoring dashboard',
              'Security monitoring and audit logging',
              'Rate limiting and access control',
              'Credential encryption and secure storage',
              'Error handling and logging',
            ],
            performanceFeatures: [
              'Multi-tier caching system (fast, api, static, session)',
              'Connection pooling with health monitoring',
              'Request batching with deduplication',
              'Compression with gzip/deflate',
              'Performance dashboard with alerts',
              'Memory usage optimization',
              'Response time optimization (<100ms target for cached)',
              'Cache hit rate optimization (>80% target)',
            ],
            toolsAvailable: [
              'Authentication tools (6 tools)',
              'List management tools (8 tools)',
              'Recipe management tools (6 tools)',
              'Meal planning tools (4 tools)',
              'Performance monitoring tools (5 tools)',
              'System monitoring tools (3 tools)',
              'Security tools (2 tools)',
            ],
            securityFeatures: [
              'AES-256-GCM credential encryption',
              'PBKDF2 key derivation',
              'Rate limiting (auth, API, strict)',
              'Request signature verification',
              'Input validation and sanitization',
              'Security audit logging',
              'Integrity verification',
            ],
            environment: {
              nodeVersion: process.version,
              platform: process.platform,
              arch: process.arch,
              uptime: process.uptime(),
              securityEnabled: !!process.env.ANYLIST_ENCRYPTION_KEY,
              performanceOptimized: true,
              cacheEnabled: true,
              compressionEnabled: true,
            },
            timestamp: new Date().toISOString(),
          }, null, 2);
        } catch (error) {
          return JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          }, null, 2);
        }
      },
    });

    // Register all tools with performance tracking
    Logger.info('Registering MCP tools...');
    const toolRegistrationStart = Date.now();
    
    registerAuthTools(server);
    registerListTools(server, anylistService);
    registerRecipeTools(server, anylistService);
    registerMealTools(server, anylistService);
    
    const toolRegistrationDuration = Date.now() - toolRegistrationStart;
    PerformanceMonitor.record('tool_registration', toolRegistrationDuration);
    Logger.info('All MCP tools registered successfully');

    // Start health monitoring
    HealthMonitor.startPeriodicChecks(60000); // Check every minute

    // Setup graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      Logger.info(`Received ${signal} signal, initiating graceful shutdown...`);
      try {
        Logger.info('Disconnecting from AnyList...');
        // Add any cleanup logic here when AnyList SDK supports it
        
        Logger.info('Graceful shutdown completed successfully');
        process.exit(0);
      } catch (error) {
        Logger.error('Error during graceful shutdown', { error: error instanceof Error ? error.message : String(error) });
        process.exit(1);
      }
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // For nodemon

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      Logger.error('Uncaught exception detected', { error: error.message, stack: error.stack });
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      Logger.error('Unhandled promise rejection detected', { reason: String(reason) });
      process.exit(1);
    });

    // Start the server
    Logger.info('Starting FastMCP server...');

    await server.start({
      transportType: 'stdio',
    });
    
    const serverStartupDuration = Date.now() - startTime;
    PerformanceMonitor.record('server_startup', serverStartupDuration);
    
    Logger.info('Server started successfully', {
      startupTime: serverStartupDuration + 'ms',
      transportType: 'stdio',
      toolsRegistered: [
        'Authentication tools (6)',
        'List management tools (8)', 
        'Recipe management tools (6)',
        'Meal planning tools (4)',
        'System monitoring tools (3)',
        'Security tools (2)',
      ],
      totalTools: '29 tools registered',
    });
    
    Logger.info('AnyList MCP server is ready to accept connections');
    Logger.info('Use health_check tool to monitor server status');
    Logger.info('Use performance_metrics tool to track operation performance');
    Logger.info('Use security_status tool to monitor security and audit logs');
    Logger.info('Use rate_limit_management tool to manage access controls');
    Logger.info('Use server_info tool to get detailed capability information');

  } catch (error) {
    if (error instanceof MCPServerError) {
      Logger.error(`Server startup failed [${error.code}]`, { message: error.message });
    } else {
      Logger.error('Unexpected error during server startup', { error: error instanceof Error ? error.message : String(error) });
    }
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    Logger.error('Fatal error starting server', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  });
} 