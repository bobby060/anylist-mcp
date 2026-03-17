import NodeCache from 'node-cache';
import { logger } from './logger.js';

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  keyCount: number;
  memory: NodeJS.MemoryUsage;
  size: number;
}

export interface CacheOptions {
  ttl?: number;
  checkPeriod?: number;
  maxKeys?: number;
  compress?: boolean;
  namespace?: string;
}

/**
 * Enhanced caching system with multiple cache instances and advanced features
 */
export class CacheManager {
  private caches: Map<string, NodeCache> = new Map();
  private stats: Map<string, { hits: number; misses: number }> = new Map();
  private compression: boolean = false;

  constructor() {
    this.initializeDefaultCaches();
  }

  /**
   * Initialize default cache instances with optimized configurations
   */
  private initializeDefaultCaches(): void {
    // Fast cache for frequently accessed data (1 minute TTL)
    this.createCache('fast', {
      ttl: 60,
      checkPeriod: 30,
      maxKeys: 1000,
    });

    // Medium cache for API responses (5 minutes TTL)
    this.createCache('api', {
      ttl: 300,
      checkPeriod: 120,
      maxKeys: 500,
    });

    // Long cache for static data (30 minutes TTL)
    this.createCache('static', {
      ttl: 1800,
      checkPeriod: 600,
      maxKeys: 200,
    });

    // Session cache for user data (1 hour TTL)
    this.createCache('session', {
      ttl: 3600,
      checkPeriod: 900,
      maxKeys: 100,
    });

    logger.info('Cache Manager initialized with default caches', {
      cacheNames: Array.from(this.caches.keys()),
    });
  }

  /**
   * Create a new cache instance
   */
  createCache(name: string, options: CacheOptions = {}): NodeCache {
    const cache = new NodeCache({
      stdTTL: options.ttl || 300,
      checkperiod: options.checkPeriod || 120,
      maxKeys: options.maxKeys || 1000,
      useClones: true,
      deleteOnExpire: true,
    });

    // Initialize stats for this cache
    this.stats.set(name, { hits: 0, misses: 0 });

    // Add event listeners for monitoring
    cache.on('set', (key, value) => {
      logger.debug(`Cache SET: ${name}:${key}`, { size: this.getSizeEstimate(value) });
    });

    cache.on('get', (key, value) => {
      const stats = this.stats.get(name)!;
      if (value !== undefined) {
        stats.hits++;
        logger.debug(`Cache HIT: ${name}:${key}`);
      } else {
        stats.misses++;
        logger.debug(`Cache MISS: ${name}:${key}`);
      }
    });

    cache.on('del', (key, value) => {
      logger.debug(`Cache DELETE: ${name}:${key}`);
    });

    cache.on('expired', (key, value) => {
      logger.debug(`Cache EXPIRED: ${name}:${key}`);
    });

    this.caches.set(name, cache);
    this.stats.set(name, { hits: 0, misses: 0 });
    logger.info(`Cache '${name}' created`, options);

    return cache;
  }

  /**
   * Get cache instance by name
   */
  getCache(name: string): NodeCache | undefined {
    return this.caches.get(name);
  }

  /**
   * Set value in specific cache with optional TTL override
   */
  set(cacheName: string, key: string, value: any, ttl?: number): boolean {
    const cache = this.caches.get(cacheName);
    if (!cache) {
      logger.warn(`Cache '${cacheName}' not found`);
      return false;
    }

    try {
      const processedValue = this.compression ? this.compress(value) : value;
      return cache.set(key, processedValue, ttl);
    } catch (error) {
      logger.error(`Failed to set cache value: ${cacheName}:${key}`, { error });
      return false;
    }
  }

  /**
   * Get value from specific cache
   */
  get<T = any>(cacheName: string, key: string): T | undefined {
    const cache = this.caches.get(cacheName);
    if (!cache) {
      logger.warn(`Cache '${cacheName}' not found`);
      return undefined;
    }

    try {
      const value = cache.get<T>(key);
      
      // Track stats
      const stats = this.stats.get(cacheName) || { hits: 0, misses: 0 };
      if (value !== undefined) {
        stats.hits++;
      } else {
        stats.misses++;
      }
      this.stats.set(cacheName, stats);
      
      if (value !== undefined && this.compression) {
        return this.decompress(value);
      }
      return value;
    } catch (error) {
      logger.error(`Failed to get cache value: ${cacheName}:${key}`, { error });
      return undefined;
    }
  }

  /**
   * Delete value from specific cache
   */
  del(cacheName: string, key: string): number {
    const cache = this.caches.get(cacheName);
    if (!cache) {
      logger.warn(`Cache '${cacheName}' not found`);
      return 0;
    }

    return cache.del(key);
  }

  /**
   * Check if key exists in cache
   */
  has(cacheName: string, key: string): boolean {
    const cache = this.caches.get(cacheName);
    if (!cache) {
      return false;
    }

    return cache.has(key);
  }

  /**
   * Get or set pattern - retrieve from cache or execute function and cache result
   */
  async getOrSet<T>(
    cacheName: string,
    key: string,
    fn: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = this.get<T>(cacheName, key);
    if (cached !== undefined) {
      return cached;
    }

    try {
      const result = await fn();
      this.set(cacheName, key, result, ttl);
      return result;
    } catch (error) {
      logger.error(`Failed to execute function for cache key: ${cacheName}:${key}`, { error });
      throw error;
    }
  }

  /**
   * Memoize function calls with automatic caching
   */
  memoize<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    options: {
      cacheName?: string;
      keyGenerator?: (...args: Parameters<T>) => string;
      ttl?: number;
    } = {}
  ): T {
    const cacheName = options.cacheName || 'api';
    const keyGenerator = options.keyGenerator || ((...args) => JSON.stringify(args));

    return (async (...args: Parameters<T>) => {
      const key = `memoized:${fn.name}:${keyGenerator(...args)}`;
      
      return this.getOrSet(
        cacheName,
        key,
        () => fn(...args),
        options.ttl
      );
    }) as T;
  }

  /**
   * Clear all caches or specific cache
   */
  clear(cacheName?: string): void {
    if (cacheName) {
      const cache = this.caches.get(cacheName);
      if (cache) {
        cache.flushAll();
        const stats = this.stats.get(cacheName);
        if (stats) {
          stats.hits = 0;
          stats.misses = 0;
        }
        logger.info(`Cache '${cacheName}' cleared`);
      }
    } else {
      for (const [name, cache] of this.caches) {
        cache.flushAll();
        const stats = this.stats.get(name);
        if (stats) {
          stats.hits = 0;
          stats.misses = 0;
        }
      }
      logger.info('All caches cleared');
    }
  }

  /**
   * Get comprehensive cache statistics
   */
  getStats(): Record<string, CacheStats> {
    const result: Record<string, CacheStats> = {};

    for (const [name, cache] of this.caches) {
      const stats = this.stats.get(name)!;
      const totalRequests = stats.hits + stats.misses;
      const hitRate = totalRequests > 0 ? (stats.hits / totalRequests) * 100 : 0;

      result[name] = {
        hits: stats.hits,
        misses: stats.misses,
        hitRate: Math.round(hitRate * 100) / 100,
        keyCount: cache.keys().length,
        memory: process.memoryUsage(),
        size: this.estimateCacheSize(cache),
      };
    }

    return result;
  }

  /**
   * Get cache keys for debugging
   */
  getKeys(cacheName?: string): Record<string, string[]> {
    if (cacheName) {
      const cache = this.caches.get(cacheName);
      return cache ? { [cacheName]: cache.keys() } : {};
    }

    const result: Record<string, string[]> = {};
    for (const [name, cache] of this.caches) {
      result[name] = cache.keys();
    }
    return result;
  }

  /**
   * Optimize cache performance by cleaning expired keys
   */
  optimize(): void {
    let totalCleaned = 0;
    
    for (const [name, cache] of this.caches) {
      const beforeKeys = cache.keys().length;
      
      // Force garbage collection of expired keys
      cache.keys().forEach(key => {
        const ttl = cache.getTtl(key);
        if (ttl && ttl < Date.now()) {
          cache.del(key);
        }
      });
      
      const afterKeys = cache.keys().length;
      const cleaned = beforeKeys - afterKeys;
      totalCleaned += cleaned;
      
      if (cleaned > 0) {
        logger.info(`Cache '${name}' optimized`, { 
          cleanedKeys: cleaned, 
          remainingKeys: afterKeys 
        });
      }
    }

    if (totalCleaned > 0) {
      logger.info('Cache optimization completed', { totalCleaned });
    }
  }

  /**
   * Enable compression for cache values
   */
  enableCompression(): void {
    this.compression = true;
    logger.info('Cache compression enabled');
  }

  /**
   * Disable compression for cache values
   */
  disableCompression(): void {
    this.compression = false;
    logger.info('Cache compression disabled');
  }

  /**
   * Get cache health status
   */
  getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    caches: Record<string, any>;
    totalMemory: number;
    recommendations: string[];
    } {
    const stats = this.getStats();
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    const recommendations: string[] = [];
    let totalMemory = 0;

    for (const [name, cacheStat] of Object.entries(stats)) {
      totalMemory += cacheStat.size;

      // Check hit rate
      if (cacheStat.hitRate < 50 && cacheStat.hits + cacheStat.misses > 100) {
        status = 'degraded';
        recommendations.push(`Cache '${name}' has low hit rate (${cacheStat.hitRate}%)`);
      }

      // Check memory usage
      if (cacheStat.size > 100 * 1024 * 1024) { // 100MB
        status = 'degraded';
        recommendations.push(`Cache '${name}' is using high memory (${Math.round(cacheStat.size / 1024 / 1024)}MB)`);
      }

      // Check key count
      if (cacheStat.keyCount > 5000) {
        recommendations.push(`Cache '${name}' has many keys (${cacheStat.keyCount}), consider cleanup`);
      }
    }

    if (totalMemory > 512 * 1024 * 1024) { // 512MB total
      status = 'unhealthy';
      recommendations.push(`Total cache memory usage is critical (${Math.round(totalMemory / 1024 / 1024)}MB)`);
    }

    return {
      status,
      caches: stats,
      totalMemory,
      recommendations,
    };
  }

  /**
   * Estimate cache size in bytes
   */
  private estimateCacheSize(cache: NodeCache): number {
    const keys = cache.keys();
    let totalSize = 0;

    for (const key of keys) {
      const value = cache.get(key);
      totalSize += this.getSizeEstimate(key) + this.getSizeEstimate(value);
    }

    return totalSize;
  }

  /**
   * Estimate object size in bytes
   */
  private getSizeEstimate(obj: any): number {
    if (obj === null || obj === undefined) return 0;
    if (typeof obj === 'string') return obj.length * 2; // UTF-16
    if (typeof obj === 'number') return 8;
    if (typeof obj === 'boolean') return 1;
    if (Buffer.isBuffer(obj)) return obj.length;
    
    try {
      return JSON.stringify(obj).length * 2;
    } catch {
      return 0;
    }
  }

  /**
   * Simple compression (could be enhanced with actual compression libraries)
   */
  private compress(value: any): any {
    // For now, just return as-is
    // In production, you might use zlib or other compression
    return value;
  }

  /**
   * Simple decompression
   */
  private decompress(value: any): any {
    // For now, just return as-is
    return value;
  }
}

// Export singleton instance
export const cacheManager = new CacheManager();

// Convenience functions
export const cache = {
  set: (cacheName: string, key: string, value: any, ttl?: number) => 
    cacheManager.set(cacheName, key, value, ttl),
  
  get: <T = any>(cacheName: string, key: string) => 
    cacheManager.get<T>(cacheName, key),
  
  del: (cacheName: string, key: string) => 
    cacheManager.del(cacheName, key),
  
  has: (cacheName: string, key: string) => 
    cacheManager.has(cacheName, key),
  
  getOrSet: <T>(cacheName: string, key: string, fn: () => Promise<T>, ttl?: number) =>
    cacheManager.getOrSet(cacheName, key, fn, ttl),
  
  clear: (cacheName?: string) => 
    cacheManager.clear(cacheName),
  
  stats: () => 
    cacheManager.getStats(),
};

// Auto-optimization every 10 minutes in production
if (process.env.NODE_ENV === 'production') {
  setInterval(() => {
    cacheManager.optimize();
  }, 10 * 60 * 1000);
}