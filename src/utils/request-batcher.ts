import { EventEmitter } from 'events';
import { logger } from './logger.js';
import { performanceMonitor } from './performance.js';

export interface BatchRequest<T, R> {
  id: string;
  data: T;
  resolve: (result: R) => void;
  reject: (error: Error) => void;
  timestamp: number;
  priority?: number;
}

export interface BatchOptions<T, R> {
  // Batching configuration
  maxBatchSize?: number;
  maxWaitTimeMs?: number;
  maxConcurrentBatches?: number;
  
  // Processing function
  processor: (items: T[]) => Promise<R[]>;
  
  // Key generation for deduplication
  keyGenerator?: (item: T) => string;
  
  // Priority handling
  priorityThreshold?: number;
  
  // Error handling
  retryAttempts?: number;
  retryDelayMs?: number;
  
  // Optimization
  enableDeduplication?: boolean;
  enablePrioritization?: boolean;
}

export interface BatchStats {
  totalRequests: number;
  totalBatches: number;
  averageBatchSize: number;
  averageWaitTime: number;
  averageProcessingTime: number;
  duplicatesAvoided: number;
  errors: number;
  retries: number;
  efficiency: number; // Requests per batch
}

/**
 * Advanced request batcher with deduplication, prioritization, and optimization
 */
export class RequestBatcher<T, R> extends EventEmitter {
  private pendingRequests = new Map<string, BatchRequest<T, R>>();
  private processingBatches = new Set<Promise<void>>();
  private flushTimer?: NodeJS.Timeout;
  private deduplicationMap = new Map<string, BatchRequest<T, R>>();
  
  private stats = {
    totalRequests: 0,
    totalBatches: 0,
    totalWaitTime: 0,
    totalProcessingTime: 0,
    duplicatesAvoided: 0,
    errors: 0,
    retries: 0,
  };

  constructor(
    private options: BatchOptions<T, R>,
    private name: string = 'default'
  ) {
    super();
    
    // Set defaults
    this.options = {
      maxBatchSize: 10,
      maxWaitTimeMs: 100,
      maxConcurrentBatches: 3,
      retryAttempts: 3,
      retryDelayMs: 1000,
      enableDeduplication: true,
      enablePrioritization: true,
      priorityThreshold: 5,
      ...options,
    };

    logger.info(`Request batcher '${this.name}' initialized`, this.options);
  }

  /**
   * Add a request to the batch
   */
  async add(data: T, priority: number = 0): Promise<R> {
    const requestId = this.generateRequestId();
    this.stats.totalRequests++;

    return new Promise<R>((resolve, reject) => {
      const request: BatchRequest<T, R> = {
        id: requestId,
        data,
        resolve,
        reject,
        timestamp: Date.now(),
        priority,
      };

      // Handle deduplication
      if (this.options.enableDeduplication && this.options.keyGenerator) {
        const key = this.options.keyGenerator(data);
        const existing = this.deduplicationMap.get(key);
        
        if (existing) {
          this.stats.duplicatesAvoided++;
          logger.debug(`Deduplicated request in batcher '${this.name}'`, { key });
          
          // Attach to existing request
          const originalResolve = existing.resolve;
          existing.resolve = (result: R) => {
            originalResolve(result);
            resolve(result);
          };
          
          const originalReject = existing.reject;
          existing.reject = (error: Error) => {
            originalReject(error);
            reject(error);
          };
          
          return;
        }
        
        this.deduplicationMap.set(key, request);
      }

      this.pendingRequests.set(requestId, request);

      // Handle high-priority requests
      if (this.options.enablePrioritization && 
          priority >= (this.options.priorityThreshold || 5)) {
        logger.debug(`High priority request in batcher '${this.name}'`, { priority });
        this.flush();
        return;
      }

      // Start or reset the flush timer
      this.scheduleFlush();

      // Auto-flush if batch is full
      if (this.pendingRequests.size >= this.options.maxBatchSize!) {
        this.flush();
      }
    });
  }

  /**
   * Manually flush pending requests
   */
  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }

    if (this.pendingRequests.size === 0) {
      return;
    }

    // Check concurrent batch limit
    if (this.processingBatches.size >= this.options.maxConcurrentBatches!) {
      logger.debug(`Max concurrent batches reached in '${this.name}', deferring flush`);
      this.scheduleFlush();
      return;
    }

    const requests = Array.from(this.pendingRequests.values());
    
    // Sort by priority if enabled
    if (this.options.enablePrioritization) {
      requests.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    }

    // Take up to maxBatchSize requests
    const batchRequests = requests.slice(0, this.options.maxBatchSize);
    
    // Remove from pending
    batchRequests.forEach(req => {
      this.pendingRequests.delete(req.id);
      
      // Remove from deduplication map
      if (this.options.enableDeduplication && this.options.keyGenerator) {
        const key = this.options.keyGenerator(req.data);
        this.deduplicationMap.delete(key);
      }
    });

    // Process the batch
    const batchPromise = this.processBatch(batchRequests);
    this.processingBatches.add(batchPromise);
    
    batchPromise.finally(() => {
      this.processingBatches.delete(batchPromise);
      
      // Schedule next flush if there are more pending requests
      if (this.pendingRequests.size > 0) {
        this.scheduleFlush();
      }
    });
  }

  /**
   * Get batcher statistics
   */
  getStats(): BatchStats {
    const efficiency = this.stats.totalBatches > 0 
      ? this.stats.totalRequests / this.stats.totalBatches 
      : 0;

    const averageWaitTime = this.stats.totalRequests > 0 
      ? this.stats.totalWaitTime / this.stats.totalRequests 
      : 0;

    const averageProcessingTime = this.stats.totalBatches > 0 
      ? this.stats.totalProcessingTime / this.stats.totalBatches 
      : 0;

    return {
      totalRequests: this.stats.totalRequests,
      totalBatches: this.stats.totalBatches,
      averageBatchSize: efficiency,
      averageWaitTime,
      averageProcessingTime,
      duplicatesAvoided: this.stats.duplicatesAvoided,
      errors: this.stats.errors,
      retries: this.stats.retries,
      efficiency,
    };
  }

  /**
   * Get current status
   */
  getStatus(): {
    pendingRequests: number;
    processingBatches: number;
    isActive: boolean;
    healthStatus: 'healthy' | 'degraded' | 'unhealthy';
    } {
    const pendingRequests = this.pendingRequests.size;
    const processingBatches = this.processingBatches.size;
    
    let healthStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (pendingRequests > this.options.maxBatchSize! * 2) {
      healthStatus = 'degraded';
    }
    
    if (pendingRequests > this.options.maxBatchSize! * 5 || this.stats.errors > 10) {
      healthStatus = 'unhealthy';
    }

    return {
      pendingRequests,
      processingBatches,
      isActive: pendingRequests > 0 || processingBatches > 0,
      healthStatus,
    };
  }

  /**
   * Clear all pending requests
   */
  clear(): void {
    for (const request of this.pendingRequests.values()) {
      request.reject(new Error('Batcher cleared'));
    }
    
    this.pendingRequests.clear();
    this.deduplicationMap.clear();
    
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    
    logger.info(`Request batcher '${this.name}' cleared`);
  }

  /**
   * Close the batcher and process remaining requests
   */
  async close(): Promise<void> {
    // Flush remaining requests
    if (this.pendingRequests.size > 0) {
      this.flush();
    }
    
    // Wait for processing batches to complete
    await Promise.allSettled(Array.from(this.processingBatches));
    
    this.clear();
    logger.info(`Request batcher '${this.name}' closed`);
  }

  // Private methods

  private scheduleFlush(): void {
    if (this.flushTimer) {
      return; // Timer already scheduled
    }

    this.flushTimer = setTimeout(() => {
      this.flush();
    }, this.options.maxWaitTimeMs);
  }

  private async processBatch(requests: BatchRequest<T, R>[]): Promise<void> {
    if (requests.length === 0) {
      return;
    }

    const batchId = this.generateBatchId();
    const startTime = Date.now();
    
    logger.debug(`Processing batch '${batchId}' in batcher '${this.name}'`, {
      batchSize: requests.length,
      priorities: requests.map(r => r.priority || 0),
    });

    this.stats.totalBatches++;

    // Calculate wait time for requests
    requests.forEach(req => {
      this.stats.totalWaitTime += startTime - req.timestamp;
    });

    let attempt = 0;
    const maxAttempts = this.options.retryAttempts! + 1;

    while (attempt < maxAttempts) {
      try {
        const data = requests.map(req => req.data);
        const results = await this.options.processor(data);

        if (results.length !== requests.length) {
          throw new Error(
            `Processor returned ${results.length} results for ${requests.length} requests`
          );
        }

        // Resolve all requests with their corresponding results
        requests.forEach((req, index) => {
          req.resolve(results[index]);
        });

        const processingTime = Date.now() - startTime;
        this.stats.totalProcessingTime += processingTime;

        performanceMonitor.recordOperation(
          `batch_processing_${this.name}`,
          processingTime,
          { batchSize: requests.length, attempt }
        );

        logger.debug(`Batch '${batchId}' completed successfully`, {
          batchSize: requests.length,
          processingTime,
          attempt,
        });

        this.emit('batchCompleted', {
          batchId,
          requestCount: requests.length,
          processingTime,
          attempt,
        });

        return;

      } catch (error) {
        attempt++;
        this.stats.errors++;

        if (attempt >= maxAttempts) {
          // Final attempt failed, reject all requests
          requests.forEach(req => {
            req.reject(error instanceof Error ? error : new Error(String(error)));
          });

          logger.error(`Batch '${batchId}' failed after ${attempt} attempts`, {
            batchSize: requests.length,
            error,
          });

          this.emit('batchFailed', {
            batchId,
            requestCount: requests.length,
            error,
            attempts: attempt,
          });

          return;
        }

        // Retry after delay
        this.stats.retries++;
        logger.warn(`Batch '${batchId}' attempt ${attempt} failed, retrying`, {
          error: error instanceof Error ? error.message : String(error),
          nextAttemptIn: this.options.retryDelayMs,
        });

        await new Promise(resolve => setTimeout(resolve, this.options.retryDelayMs));
      }
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Batcher manager for multiple request batchers
 */
export class BatcherManager {
  private batchers = new Map<string, RequestBatcher<any, any>>();

  /**
   * Create a new request batcher
   */
  createBatcher<T, R>(name: string, options: BatchOptions<T, R>): RequestBatcher<T, R> {
    if (this.batchers.has(name)) {
      throw new Error(`Batcher '${name}' already exists`);
    }

    const batcher = new RequestBatcher(options, name);
    this.batchers.set(name, batcher);

    logger.info(`Request batcher '${name}' registered`);
    return batcher;
  }

  /**
   * Get an existing batcher
   */
  getBatcher<T, R>(name: string): RequestBatcher<T, R> | undefined {
    return this.batchers.get(name);
  }

  /**
   * Close all batchers
   */
  async closeAll(): Promise<void> {
    const closePromises = Array.from(this.batchers.values()).map(batcher => batcher.close());
    await Promise.allSettled(closePromises);
    this.batchers.clear();
    logger.info('All request batchers closed');
  }

  /**
   * Get statistics for all batchers
   */
  getAllStats(): Record<string, BatchStats> {
    const stats: Record<string, BatchStats> = {};
    for (const [name, batcher] of this.batchers) {
      stats[name] = batcher.getStats();
    }
    return stats;
  }

  /**
   * Get status for all batchers
   */
  getAllStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    for (const [name, batcher] of this.batchers) {
      status[name] = batcher.getStatus();
    }
    return status;
  }

  /**
   * Get health status for all batchers
   */
  getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    batchers: Record<string, any>;
    recommendations: string[];
    } {
    const allStatus = this.getAllStatus();
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    const recommendations: string[] = [];

    for (const [name, status] of Object.entries(allStatus)) {
      if (status.healthStatus === 'degraded' && overallStatus === 'healthy') {
        overallStatus = 'degraded';
      }
      if (status.healthStatus === 'unhealthy') {
        overallStatus = 'unhealthy';
      }

      // Generate recommendations
      if (status.pendingRequests > 50) {
        recommendations.push(`Batcher '${name}' has high pending requests (${status.pendingRequests})`);
      }
      if (status.processingBatches > 5) {
        recommendations.push(`Batcher '${name}' has many processing batches (${status.processingBatches})`);
      }
    }

    return {
      status: overallStatus,
      batchers: allStatus,
      recommendations,
    };
  }
}

// Export singleton batcher manager
export const batcherManager = new BatcherManager();

// Convenience function for creating common batchers
export const createOptimizedBatcher = <T, R>(
  name: string,
  processor: (items: T[]) => Promise<R[]>,
  keyGenerator?: (item: T) => string
): RequestBatcher<T, R> => {
  return batcherManager.createBatcher(name, {
    maxBatchSize: 10,
    maxWaitTimeMs: 50,
    maxConcurrentBatches: 3,
    processor,
    keyGenerator,
    enableDeduplication: !!keyGenerator,
    enablePrioritization: true,
    retryAttempts: 2,
    retryDelayMs: 500,
  });
};