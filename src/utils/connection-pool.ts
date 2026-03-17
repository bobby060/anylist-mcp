import { EventEmitter } from 'events';
import { logger } from './logger.js';
import { performanceMonitor } from './performance.js';

export interface PoolConnection<T> {
  id: string;
  connection: T;
  isIdle: boolean;
  createdAt: Date;
  lastUsed: Date;
  usageCount: number;
  maxUsage?: number;
  ttl?: number;
}

export interface ConnectionPoolOptions<T> {
  // Pool sizing
  minConnections?: number;
  maxConnections?: number;
  acquireTimeoutMs?: number;
  idleTimeoutMs?: number;
  
  // Connection management
  maxUsagePerConnection?: number;
  connectionTtl?: number;
  
  // Health checks
  testOnBorrow?: boolean;
  testOnReturn?: boolean;
  validationInterval?: number;
  
  // Factory functions
  create: () => Promise<T>;
  destroy?: (connection: T) => Promise<void>;
  validate?: (connection: T) => Promise<boolean>;
  reset?: (connection: T) => Promise<void>;
}

export interface PoolStats {
  total: number;
  idle: number;
  active: number;
  pending: number;
  created: number;
  destroyed: number;
  acquired: number;
  released: number;
  timeouts: number;
  errors: number;
  averageAcquireTime: number;
  averageCreateTime: number;
  poolHealth: 'healthy' | 'degraded' | 'unhealthy';
}

/**
 * Advanced connection pool with health monitoring and optimization
 */
export class ConnectionPool<T> extends EventEmitter {
  private connections = new Map<string, PoolConnection<T>>();
  private pendingAcquisitions: Array<{
    resolve: (connection: T) => void;
    reject: (error: Error) => void;
    timestamp: number;
  }> = [];
  
  private stats = {
    created: 0,
    destroyed: 0,
    acquired: 0,
    released: 0,
    timeouts: 0,
    errors: 0,
    totalAcquireTime: 0,
    totalCreateTime: 0,
  };
  
  private healthCheckInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;
  private isClosing = false;

  constructor(
    private options: ConnectionPoolOptions<T>,
    private name: string = 'default'
  ) {
    super();
    
    // Set defaults
    this.options = {
      minConnections: 2,
      maxConnections: 10,
      acquireTimeoutMs: 10000,
      idleTimeoutMs: 300000, // 5 minutes
      maxUsagePerConnection: 1000,
      connectionTtl: 1800000, // 30 minutes
      testOnBorrow: true,
      testOnReturn: false,
      validationInterval: 60000, // 1 minute
      ...options,
    };

    this.initialize();
  }

  /**
   * Initialize the connection pool
   */
  private async initialize(): Promise<void> {
    try {
      // Create minimum connections
      const minConnections = this.options.minConnections!;
      const createPromises = Array(minConnections).fill(0).map(() => this.createConnection());
      
      await Promise.all(createPromises);
      
      // Start background tasks
      this.startHealthChecks();
      this.startCleanupTask();
      
      logger.info(`Connection pool '${this.name}' initialized`, {
        minConnections,
        maxConnections: this.options.maxConnections,
        totalConnections: this.connections.size,
      });
      
      this.emit('initialized');
    } catch (error) {
      logger.error(`Failed to initialize connection pool '${this.name}'`, { error });
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Acquire a connection from the pool
   */
  async acquire(): Promise<T> {
    if (this.isClosing) {
      throw new Error(`Connection pool '${this.name}' is closing`);
    }

    const startTime = Date.now();

    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        // Remove from pending queue
        const index = this.pendingAcquisitions.findIndex(p => p.resolve === resolve);
        if (index >= 0) {
          this.pendingAcquisitions.splice(index, 1);
        }
        
        this.stats.timeouts++;
        reject(new Error(`Connection acquisition timeout after ${this.options.acquireTimeoutMs}ms`));
      }, this.options.acquireTimeoutMs);

      const acquireConnection = async () => {
        try {
          clearTimeout(timeoutId);
          
          // Try to get an idle connection
          let connection = this.getIdleConnection();
          
          if (!connection) {
            // Create new connection if under limit
            if (this.connections.size < this.options.maxConnections!) {
              connection = await this.createConnection();
            } else {
              // Add to pending queue
              this.pendingAcquisitions.push({
                resolve: acquireConnection,
                reject,
                timestamp: Date.now(),
              });
              return;
            }
          }

          // Validate connection if required
          if (this.options.testOnBorrow && this.options.validate) {
            const isValid = await this.options.validate(connection.connection);
            if (!isValid) {
              await this.destroyConnection(connection.id);
              // Try again
              return acquireConnection();
            }
          }

          // Mark as active
          connection.isIdle = false;
          connection.lastUsed = new Date();
          connection.usageCount++;

          this.stats.acquired++;
          this.stats.totalAcquireTime += Date.now() - startTime;

          performanceMonitor.recordOperation(
            `connection_pool_acquire_${this.name}`,
            Date.now() - startTime
          );

          resolve(connection.connection);
        } catch (error) {
          clearTimeout(timeoutId);
          this.stats.errors++;
          reject(error);
        }
      };

      acquireConnection();
    });
  }

  /**
   * Release a connection back to the pool
   */
  async release(connection: T): Promise<void> {
    const poolConnection = this.findPoolConnection(connection);
    if (!poolConnection) {
      logger.warn(`Attempted to release unknown connection in pool '${this.name}'`);
      return;
    }

    try {
      // Validate connection if required
      if (this.options.testOnReturn && this.options.validate) {
        const isValid = await this.options.validate(connection);
        if (!isValid) {
          await this.destroyConnection(poolConnection.id);
          this.processNextPending();
          return;
        }
      }

      // Reset connection if needed
      if (this.options.reset) {
        await this.options.reset(connection);
      }

      // Check if connection should be destroyed
      if (this.shouldDestroyConnection(poolConnection)) {
        await this.destroyConnection(poolConnection.id);
        this.processNextPending();
        return;
      }

      // Mark as idle
      poolConnection.isIdle = true;
      poolConnection.lastUsed = new Date();
      this.stats.released++;

      // Process next pending acquisition
      this.processNextPending();

      this.emit('released', poolConnection.id);
    } catch (error) {
      logger.error(`Error releasing connection in pool '${this.name}'`, { error });
      await this.destroyConnection(poolConnection.id);
      this.processNextPending();
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    const idle = Array.from(this.connections.values()).filter(c => c.isIdle).length;
    const active = this.connections.size - idle;
    const pending = this.pendingAcquisitions.length;

    const averageAcquireTime = this.stats.acquired > 0 
      ? this.stats.totalAcquireTime / this.stats.acquired 
      : 0;

    const averageCreateTime = this.stats.created > 0 
      ? this.stats.totalCreateTime / this.stats.created 
      : 0;

    // Determine pool health
    let poolHealth: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (pending > this.options.maxConnections! * 0.5 || this.stats.timeouts > 10) {
      poolHealth = 'degraded';
    }
    
    if (pending > this.options.maxConnections! || this.stats.errors > 20) {
      poolHealth = 'unhealthy';
    }

    return {
      total: this.connections.size,
      idle,
      active,
      pending,
      created: this.stats.created,
      destroyed: this.stats.destroyed,
      acquired: this.stats.acquired,
      released: this.stats.released,
      timeouts: this.stats.timeouts,
      errors: this.stats.errors,
      averageAcquireTime,
      averageCreateTime,
      poolHealth,
    };
  }

  /**
   * Clear all connections and close the pool
   */
  async close(): Promise<void> {
    this.isClosing = true;

    // Clear intervals
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Reject pending acquisitions
    for (const pending of this.pendingAcquisitions) {
      pending.reject(new Error('Connection pool is closing'));
    }
    this.pendingAcquisitions = [];

    // Destroy all connections
    const destroyPromises = Array.from(this.connections.keys()).map(id => 
      this.destroyConnection(id)
    );

    await Promise.allSettled(destroyPromises);

    logger.info(`Connection pool '${this.name}' closed`);
    this.emit('closed');
  }

  /**
   * Manually trigger health check
   */
  async healthCheck(): Promise<void> {
    if (!this.options.validate) {
      return;
    }

    const connections = Array.from(this.connections.values());
    const healthChecks = connections.map(async (poolConn) => {
      try {
        const isValid = await this.options.validate!(poolConn.connection);
        if (!isValid) {
          logger.warn(`Invalid connection detected in pool '${this.name}', destroying`, {
            connectionId: poolConn.id,
          });
          await this.destroyConnection(poolConn.id);
        }
      } catch (error) {
        logger.error(`Health check failed for connection in pool '${this.name}'`, {
          connectionId: poolConn.id,
          error,
        });
        await this.destroyConnection(poolConn.id);
      }
    });

    await Promise.allSettled(healthChecks);
  }

  /**
   * Get detailed pool information
   */
  getInfo(): any {
    const stats = this.getStats();
    const connections = Array.from(this.connections.values()).map(conn => ({
      id: conn.id,
      isIdle: conn.isIdle,
      createdAt: conn.createdAt.toISOString(),
      lastUsed: conn.lastUsed.toISOString(),
      usageCount: conn.usageCount,
      age: Date.now() - conn.createdAt.getTime(),
    }));

    return {
      name: this.name,
      options: this.options,
      stats,
      connections,
      isClosing: this.isClosing,
    };
  }

  // Private methods

  private async createConnection(): Promise<PoolConnection<T>> {
    const startTime = Date.now();
    
    try {
      const connection = await this.options.create();
      const id = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const poolConnection: PoolConnection<T> = {
        id,
        connection,
        isIdle: true,
        createdAt: new Date(),
        lastUsed: new Date(),
        usageCount: 0,
        maxUsage: this.options.maxUsagePerConnection,
        ttl: this.options.connectionTtl,
      };

      this.connections.set(id, poolConnection);
      this.stats.created++;
      this.stats.totalCreateTime += Date.now() - startTime;

      performanceMonitor.recordOperation(
        `connection_pool_create_${this.name}`,
        Date.now() - startTime
      );

      logger.debug(`Connection created in pool '${this.name}'`, {
        connectionId: id,
        totalConnections: this.connections.size,
      });

      this.emit('created', id);
      return poolConnection;
    } catch (error) {
      this.stats.errors++;
      logger.error(`Failed to create connection in pool '${this.name}'`, { error });
      throw error;
    }
  }

  private async destroyConnection(id: string): Promise<void> {
    const poolConnection = this.connections.get(id);
    if (!poolConnection) {
      return;
    }

    try {
      if (this.options.destroy) {
        await this.options.destroy(poolConnection.connection);
      }
      
      this.connections.delete(id);
      this.stats.destroyed++;

      logger.debug(`Connection destroyed in pool '${this.name}'`, {
        connectionId: id,
        totalConnections: this.connections.size,
      });

      this.emit('destroyed', id);
    } catch (error) {
      logger.error(`Error destroying connection in pool '${this.name}'`, {
        connectionId: id,
        error,
      });
    }
  }

  private getIdleConnection(): PoolConnection<T> | null {
    for (const connection of this.connections.values()) {
      if (connection.isIdle && !this.shouldDestroyConnection(connection)) {
        return connection;
      }
    }
    return null;
  }

  private findPoolConnection(connection: T): PoolConnection<T> | null {
    for (const poolConnection of this.connections.values()) {
      if (poolConnection.connection === connection) {
        return poolConnection;
      }
    }
    return null;
  }

  private shouldDestroyConnection(poolConnection: PoolConnection<T>): boolean {
    // Check max usage
    if (poolConnection.maxUsage && poolConnection.usageCount >= poolConnection.maxUsage) {
      return true;
    }

    // Check TTL
    if (poolConnection.ttl) {
      const age = Date.now() - poolConnection.createdAt.getTime();
      if (age > poolConnection.ttl) {
        return true;
      }
    }

    // Check idle timeout
    const idleTime = Date.now() - poolConnection.lastUsed.getTime();
    if (idleTime > this.options.idleTimeoutMs!) {
      return true;
    }

    return false;
  }

  private processNextPending(): void {
    if (this.pendingAcquisitions.length > 0) {
      const next = this.pendingAcquisitions.shift()!;
      // Process asynchronously to avoid blocking
      setImmediate(() => next.resolve);
    }
  }

  private startHealthChecks(): void {
    if (this.options.validationInterval && this.options.validate) {
      this.healthCheckInterval = setInterval(() => {
        this.healthCheck().catch(error => {
          logger.error(`Health check failed for pool '${this.name}'`, { error });
        });
      }, this.options.validationInterval);
    }
  }

  private startCleanupTask(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Run every minute
  }

  private async cleanup(): Promise<void> {
    const connectionsToDestroy: string[] = [];

    for (const [id, connection] of this.connections) {
      if (connection.isIdle && this.shouldDestroyConnection(connection)) {
        connectionsToDestroy.push(id);
      }
    }

    // Don't destroy below minimum connections
    const minConnections = this.options.minConnections!;
    const currentConnections = this.connections.size;
    const maxToDestroy = Math.max(0, currentConnections - minConnections);
    
    const toDestroy = connectionsToDestroy.slice(0, maxToDestroy);

    for (const id of toDestroy) {
      await this.destroyConnection(id);
    }

    if (toDestroy.length > 0) {
      logger.debug(`Cleanup destroyed ${toDestroy.length} connections in pool '${this.name}'`);
    }
  }
}

/**
 * Pool manager for multiple connection pools
 */
export class PoolManager {
  private pools = new Map<string, ConnectionPool<any>>();

  /**
   * Create a new connection pool
   */
  createPool<T>(name: string, options: ConnectionPoolOptions<T>): ConnectionPool<T> {
    if (this.pools.has(name)) {
      throw new Error(`Pool '${name}' already exists`);
    }

    const pool = new ConnectionPool(options, name);
    this.pools.set(name, pool);

    logger.info(`Connection pool '${name}' registered`);
    return pool;
  }

  /**
   * Get an existing pool
   */
  getPool<T>(name: string): ConnectionPool<T> | undefined {
    return this.pools.get(name);
  }

  /**
   * Close all pools
   */
  async closeAll(): Promise<void> {
    const closePromises = Array.from(this.pools.values()).map(pool => pool.close());
    await Promise.allSettled(closePromises);
    this.pools.clear();
    logger.info('All connection pools closed');
  }

  /**
   * Get statistics for all pools
   */
  getAllStats(): Record<string, PoolStats> {
    const stats: Record<string, PoolStats> = {};
    for (const [name, pool] of this.pools) {
      stats[name] = pool.getStats();
    }
    return stats;
  }

  /**
   * Get health status for all pools
   */
  getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    pools: Record<string, any>;
    recommendations: string[];
    } {
    const allStats = this.getAllStats();
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    const recommendations: string[] = [];

    for (const [name, stats] of Object.entries(allStats)) {
      if (stats.poolHealth === 'degraded' && overallStatus === 'healthy') {
        overallStatus = 'degraded';
      }
      if (stats.poolHealth === 'unhealthy') {
        overallStatus = 'unhealthy';
      }

      // Generate recommendations
      if (stats.pending > stats.total) {
        recommendations.push(`Pool '${name}' has high pending requests (${stats.pending})`);
      }
      if (stats.timeouts > 5) {
        recommendations.push(`Pool '${name}' has timeouts (${stats.timeouts})`);
      }
      if (stats.errors > 10) {
        recommendations.push(`Pool '${name}' has errors (${stats.errors})`);
      }
    }

    return {
      status: overallStatus,
      pools: allStats,
      recommendations,
    };
  }
}

// Export singleton pool manager
export const poolManager = new PoolManager();