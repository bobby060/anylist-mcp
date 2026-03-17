import { UserError } from 'fastmcp';
import { securityManager } from './security.js';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: any) => string;
  onLimitReached?: (req: any, identifier: string) => void;
  whitelist?: string[];
  blacklist?: string[];
}

export interface RateLimitInfo {
  identifier: string;
  windowStart: number;
  requestCount: number;
  remainingRequests: number;
  resetTime: number;
  isBlocked: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  info: RateLimitInfo;
  retryAfter?: number;
  error?: string;
}

export class RateLimiter {
  private static instances: Map<string, RateLimiter> = new Map();
  private readonly config: Required<RateLimitConfig>;
  private readonly requestWindows: Map<string, { start: number; count: number }> = new Map();
  private readonly blockedIPs: Set<string> = new Set();
  private cleanupInterval: NodeJS.Timeout | null = null;

  private constructor(name: string, config: RateLimitConfig) {
    this.config = {
      windowMs: config.windowMs,
      maxRequests: config.maxRequests,
      skipSuccessfulRequests: config.skipSuccessfulRequests || false,
      skipFailedRequests: config.skipFailedRequests || false,
      keyGenerator: config.keyGenerator || ((req: any) => req.ip || req.identifier || 'unknown'),
      onLimitReached: config.onLimitReached || (() => {}),
      whitelist: config.whitelist || [],
      blacklist: config.blacklist || [],
    };

    // Start cleanup interval
    this.startCleanupInterval();
  }

  static getInstance(name: string, config: RateLimitConfig): RateLimiter {
    if (!RateLimiter.instances.has(name)) {
      RateLimiter.instances.set(name, new RateLimiter(name, config));
    }
    return RateLimiter.instances.get(name)!;
  }

  /**
   * Check if request is allowed under rate limiting rules
   */
  checkRequest(req: any): RateLimitResult {
    const identifier = this.config.keyGenerator(req);
    const now = Date.now();

    try {
      // Check whitelist
      if (this.config.whitelist.includes(identifier)) {
        return this.createAllowedResult(identifier, now);
      }

      // Check blacklist
      if (this.config.blacklist.includes(identifier) || this.blockedIPs.has(identifier)) {
        securityManager.auditLog(
          'RATE_LIMIT_BLACKLISTED',
          `Request from blacklisted identifier: ${identifier}`,
          'medium'
        );
        return this.createBlockedResult(identifier, now, 'Identifier is blacklisted');
      }

      // Get or create window for this identifier
      const window = this.requestWindows.get(identifier) || { start: now, count: 0 };

      // Check if window has expired
      if (now - window.start >= this.config.windowMs) {
        // Reset window
        window.start = now;
        window.count = 0;
      }

      // Check if limit exceeded
      if (window.count >= this.config.maxRequests) {
        const retryAfter = Math.ceil((window.start + this.config.windowMs - now) / 1000);
        
        securityManager.auditLog(
          'RATE_LIMIT_EXCEEDED',
          `Rate limit exceeded for ${identifier}. Count: ${window.count}, Limit: ${this.config.maxRequests}`,
          'medium'
        );

        // Call limit reached callback
        this.config.onLimitReached(req, identifier);

        return this.createBlockedResult(identifier, now, 'Rate limit exceeded', retryAfter);
      }

      // Increment count
      window.count++;
      this.requestWindows.set(identifier, window);

      securityManager.auditLog(
        'RATE_LIMIT_CHECKED',
        `Request allowed for ${identifier}. Count: ${window.count}/${this.config.maxRequests}`,
        'low'
      );

      return this.createAllowedResult(identifier, now, window);
    } catch (error) {
      securityManager.auditLog(
        'RATE_LIMIT_ERROR',
        `Rate limit check error for ${identifier}: ${error instanceof Error ? error.message : String(error)}`,
        'high'
      );
      
      // Fail securely - deny request on error
      return this.createBlockedResult(identifier, now, 'Rate limit check failed');
    }
  }

  /**
   * Record request outcome (success/failure)
   */
  recordRequest(identifier: string, success: boolean): void {
    try {
      const window = this.requestWindows.get(identifier);
      if (!window) {
        return;
      }

      // Skip counting based on configuration
      if ((success && this.config.skipSuccessfulRequests) || 
          (!success && this.config.skipFailedRequests)) {
        window.count = Math.max(0, window.count - 1);
        this.requestWindows.set(identifier, window);
      }

      // Record failed attempt in security manager
      if (!success) {
        securityManager.recordFailedAttempt(identifier);
      } else {
        securityManager.clearFailedAttempts(identifier);
      }
    } catch (error) {
      securityManager.auditLog(
        'RATE_LIMIT_RECORD_ERROR',
        `Failed to record request for ${identifier}: ${error instanceof Error ? error.message : String(error)}`,
        'medium'
      );
    }
  }

  /**
   * Add identifier to blacklist
   */
  addToBlacklist(identifier: string): void {
    this.config.blacklist.push(identifier);
    this.blockedIPs.add(identifier);
    
    securityManager.auditLog(
      'RATE_LIMIT_BLACKLIST_ADDED',
      `Identifier added to blacklist: ${identifier}`,
      'medium'
    );
  }

  /**
   * Remove identifier from blacklist
   */
  removeFromBlacklist(identifier: string): void {
    const index = this.config.blacklist.indexOf(identifier);
    if (index > -1) {
      this.config.blacklist.splice(index, 1);
    }
    this.blockedIPs.delete(identifier);
    
    securityManager.auditLog(
      'RATE_LIMIT_BLACKLIST_REMOVED',
      `Identifier removed from blacklist: ${identifier}`,
      'low'
    );
  }

  /**
   * Add identifier to whitelist
   */
  addToWhitelist(identifier: string): void {
    this.config.whitelist.push(identifier);
    
    securityManager.auditLog(
      'RATE_LIMIT_WHITELIST_ADDED',
      `Identifier added to whitelist: ${identifier}`,
      'low'
    );
  }

  /**
   * Remove identifier from whitelist
   */
  removeFromWhitelist(identifier: string): void {
    const index = this.config.whitelist.indexOf(identifier);
    if (index > -1) {
      this.config.whitelist.splice(index, 1);
    }
    
    securityManager.auditLog(
      'RATE_LIMIT_WHITELIST_REMOVED',
      `Identifier removed from whitelist: ${identifier}`,
      'low'
    );
  }

  /**
   * Reset rate limit for identifier
   */
  resetLimit(identifier: string): void {
    this.requestWindows.delete(identifier);
    this.blockedIPs.delete(identifier);
    securityManager.clearFailedAttempts(identifier);
    
    securityManager.auditLog(
      'RATE_LIMIT_RESET',
      `Rate limit reset for ${identifier}`,
      'low'
    );
  }

  /**
   * Get current rate limit info for identifier
   */
  getInfo(identifier: string): RateLimitInfo {
    const now = Date.now();
    const window = this.requestWindows.get(identifier);
    
    if (!window) {
      return {
        identifier,
        windowStart: now,
        requestCount: 0,
        remainingRequests: this.config.maxRequests,
        resetTime: now + this.config.windowMs,
        isBlocked: this.blockedIPs.has(identifier),
      };
    }

    const isExpired = now - window.start >= this.config.windowMs;
    const requestCount = isExpired ? 0 : window.count;
    const remainingRequests = Math.max(0, this.config.maxRequests - requestCount);
    const resetTime = isExpired ? now + this.config.windowMs : window.start + this.config.windowMs;

    return {
      identifier,
      windowStart: isExpired ? now : window.start,
      requestCount,
      remainingRequests,
      resetTime,
      isBlocked: this.blockedIPs.has(identifier),
    };
  }

  /**
   * Get rate limiting statistics
   */
  getStats(): {
    activeWindows: number;
    blockedIPs: number;
    whitelistedIPs: number;
    blacklistedIPs: number;
    totalRequests: number;
    config: RateLimitConfig;
    } {
    const totalRequests = Array.from(this.requestWindows.values())
      .reduce((sum, window) => sum + window.count, 0);

    return {
      activeWindows: this.requestWindows.size,
      blockedIPs: this.blockedIPs.size,
      whitelistedIPs: this.config.whitelist.length,
      blacklistedIPs: this.config.blacklist.length,
      totalRequests,
      config: { ...this.config },
    };
  }

  /**
   * Clear all rate limit data
   */
  clearAll(): void {
    this.requestWindows.clear();
    this.blockedIPs.clear();
    
    securityManager.auditLog(
      'RATE_LIMIT_CLEARED',
      'All rate limit data cleared',
      'low'
    );
  }

  /**
   * Stop cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clearAll();
  }

  private createAllowedResult(identifier: string, now: number, window?: { start: number; count: number }): RateLimitResult {
    const info = this.getInfo(identifier);
    return {
      allowed: true,
      info,
    };
  }

  private createBlockedResult(identifier: string, now: number, error?: string, retryAfter?: number): RateLimitResult {
    const info = this.getInfo(identifier);
    return {
      allowed: false,
      info,
      error,
      retryAfter,
    };
  }

  private startCleanupInterval(): void {
    // Clean up expired windows every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredWindows();
    }, 5 * 60 * 1000);
  }

  private cleanupExpiredWindows(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [identifier, window] of this.requestWindows.entries()) {
      if (now - window.start >= this.config.windowMs) {
        this.requestWindows.delete(identifier);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      securityManager.auditLog(
        'RATE_LIMIT_CLEANUP',
        `Cleaned up ${cleaned} expired rate limit windows`,
        'low'
      );
    }
  }
}

/**
 * Default rate limiters for common use cases
 */
export class DefaultRateLimiters {
  private static authLimiter: RateLimiter;
  private static apiLimiter: RateLimiter;
  private static strictLimiter: RateLimiter;

  static getAuthLimiter(): RateLimiter {
    if (!DefaultRateLimiters.authLimiter) {
      DefaultRateLimiters.authLimiter = RateLimiter.getInstance('auth', {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 5, // 5 attempts per window
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
        onLimitReached: (req, identifier) => {
          securityManager.auditLog(
            'AUTH_RATE_LIMIT_EXCEEDED',
            `Authentication rate limit exceeded for ${identifier}`,
            'high'
          );
        },
      });
    }
    return DefaultRateLimiters.authLimiter;
  }

  static getApiLimiter(): RateLimiter {
    if (!DefaultRateLimiters.apiLimiter) {
      DefaultRateLimiters.apiLimiter = RateLimiter.getInstance('api', {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 60, // 60 requests per minute
        skipSuccessfulRequests: false,
        skipFailedRequests: true,
        onLimitReached: (req, identifier) => {
          securityManager.auditLog(
            'API_RATE_LIMIT_EXCEEDED',
            `API rate limit exceeded for ${identifier}`,
            'medium'
          );
        },
      });
    }
    return DefaultRateLimiters.apiLimiter;
  }

  static getStrictLimiter(): RateLimiter {
    if (!DefaultRateLimiters.strictLimiter) {
      DefaultRateLimiters.strictLimiter = RateLimiter.getInstance('strict', {
        windowMs: 60 * 60 * 1000, // 1 hour
        maxRequests: 10, // 10 requests per hour
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
        onLimitReached: (req, identifier) => {
          securityManager.auditLog(
            'STRICT_RATE_LIMIT_EXCEEDED',
            `Strict rate limit exceeded for ${identifier}`,
            'critical'
          );
        },
      });
    }
    return DefaultRateLimiters.strictLimiter;
  }
}

/**
 * Middleware function for Express-like frameworks
 */
export function createRateLimitMiddleware(limiter: RateLimiter) {
  return (req: any, res: any, next: any) => {
    const result = limiter.checkRequest(req);
    
    if (!result.allowed) {
      const error = new UserError(result.error || 'Rate limit exceeded');
      (error as any).statusCode = 429;
      (error as any).retryAfter = result.retryAfter;
      
      // Set rate limit headers
      if (res.setHeader) {
        res.setHeader('X-RateLimit-Limit', limiter.getInfo(result.info.identifier).remainingRequests + result.info.requestCount);
        res.setHeader('X-RateLimit-Remaining', result.info.remainingRequests);
        res.setHeader('X-RateLimit-Reset', new Date(result.info.resetTime).toISOString());
        
        if (result.retryAfter) {
          res.setHeader('Retry-After', result.retryAfter);
        }
      }
      
      return next(error);
    }

    // Set rate limit headers for successful requests
    if (res.setHeader) {
      res.setHeader('X-RateLimit-Limit', limiter.getInfo(result.info.identifier).remainingRequests + result.info.requestCount);
      res.setHeader('X-RateLimit-Remaining', result.info.remainingRequests);
      res.setHeader('X-RateLimit-Reset', new Date(result.info.resetTime).toISOString());
    }

    next();
  };
}