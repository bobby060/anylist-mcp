import { performanceMonitor, PerformanceStats } from './performance.js';
import { cacheManager, CacheStats } from './cache-manager.js';
import { poolManager } from './connection-pool.js';
import { batcherManager } from './request-batcher.js';
import { logger } from './logger.js';

export interface SystemMetrics {
  performance: PerformanceStats;
  cache: Record<string, CacheStats>;
  connectionPools: Record<string, any>;
  requestBatchers: Record<string, any>;
  system: SystemInfo;
  alerts: Alert[];
  recommendations: Recommendation[];
  healthScore: number;
}

export interface SystemInfo {
  uptime: number;
  memory: NodeJS.MemoryUsage;
  cpu: NodeJS.CpuUsage;
  loadAverage?: number[];
  platform: string;
  arch: string;
  nodeVersion: string;
  pid: number;
  timestamp: string;
}

export interface Alert {
  level: 'info' | 'warning' | 'error' | 'critical';
  component: string;
  message: string;
  value?: number;
  threshold?: number;
  timestamp: string;
  resolved?: boolean;
}

export interface Recommendation {
  component: string;
  issue: string;
  suggestion: string;
  impact: 'low' | 'medium' | 'high';
  effort: 'low' | 'medium' | 'high';
  priority: number;
}

export interface PerformanceThresholds {
  memory: {
    heapUsed: number; // MB
    heapTotal: number; // MB
    rss: number; // MB
  };
  performance: {
    slowOperationMs: number;
    avgResponseTimeMs: number;
    errorRate: number; // percentage
  };
  cache: {
    minHitRate: number; // percentage
    maxMemoryMB: number;
  };
  pools: {
    maxPendingRatio: number; // pending/total
    minHealthyConnections: number;
  };
  batchers: {
    maxPendingRequests: number;
    maxErrorRate: number; // percentage
  };
}

/**
 * Comprehensive performance monitoring dashboard
 */
export class PerformanceDashboard {
  private static instance: PerformanceDashboard;
  private alerts: Alert[] = [];
  private alertHistory: Alert[] = [];
  private metricsHistory: SystemMetrics[] = [];
  private readonly maxHistorySize = 100;
  private monitoringInterval?: NodeJS.Timeout;

  private thresholds: PerformanceThresholds = {
    memory: {
      heapUsed: 400, // MB
      heapTotal: 512, // MB
      rss: 600, // MB
    },
    performance: {
      slowOperationMs: 5000,
      avgResponseTimeMs: 1000,
      errorRate: 5, // 5%
    },
    cache: {
      minHitRate: 70, // 70%
      maxMemoryMB: 100,
    },
    pools: {
      maxPendingRatio: 0.5,
      minHealthyConnections: 2,
    },
    batchers: {
      maxPendingRequests: 100,
      maxErrorRate: 10, // 10%
    },
  };

  private constructor() {
    this.startMonitoring();
  }

  public static getInstance(): PerformanceDashboard {
    if (!PerformanceDashboard.instance) {
      PerformanceDashboard.instance = new PerformanceDashboard();
    }
    return PerformanceDashboard.instance;
  }

  /**
   * Get comprehensive system metrics
   */
  getMetrics(): SystemMetrics {
    const timestamp = new Date().toISOString();
    
    // Collect all metrics
    const performance = performanceMonitor.getStats();
    const cache = cacheManager.getStats();
    const connectionPools = poolManager.getAllStats();
    const requestBatchers = batcherManager.getAllStats();
    const system = this.getSystemInfo();

    // Generate alerts and recommendations
    const alerts = this.generateAlerts(performance, cache, connectionPools, requestBatchers, system);
    const recommendations = this.generateRecommendations(performance, cache, connectionPools, requestBatchers);
    
    // Calculate health score
    const healthScore = this.calculateHealthScore(performance, cache, connectionPools, requestBatchers, alerts);

    const metrics: SystemMetrics = {
      performance,
      cache,
      connectionPools,
      requestBatchers,
      system,
      alerts,
      recommendations,
      healthScore,
    };

    // Store in history
    this.metricsHistory.push(metrics);
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory.shift();
    }

    // Update current alerts
    this.updateAlerts(alerts);

    return metrics;
  }

  /**
   * Get metrics history
   */
  getHistory(count?: number): SystemMetrics[] {
    const limit = count || this.metricsHistory.length;
    return this.metricsHistory.slice(-limit);
  }

  /**
   * Get current alerts
   */
  getAlerts(level?: Alert['level']): Alert[] {
    if (level) {
      return this.alerts.filter(alert => alert.level === level && !alert.resolved);
    }
    return this.alerts.filter(alert => !alert.resolved);
  }

  /**
   * Get alert history
   */
  getAlertHistory(count?: number): Alert[] {
    const limit = count || this.alertHistory.length;
    return this.alertHistory.slice(-limit);
  }

  /**
   * Resolve an alert
   */
  resolveAlert(component: string, message: string): boolean {
    const alert = this.alerts.find(a => 
      a.component === component && 
      a.message === message && 
      !a.resolved
    );
    
    if (alert) {
      alert.resolved = true;
      alert.timestamp = new Date().toISOString();
      logger.info('Alert resolved', { component, message });
      return true;
    }
    
    return false;
  }

  /**
   * Update performance thresholds
   */
  updateThresholds(newThresholds: Partial<PerformanceThresholds>): void {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    logger.info('Performance thresholds updated', newThresholds);
  }

  /**
   * Get current thresholds
   */
  getThresholds(): PerformanceThresholds {
    return { ...this.thresholds };
  }

  /**
   * Generate performance report
   */
  generateReport(timeRangeMinutes?: number): {
    summary: any;
    trends: any;
    alerts: Alert[];
    recommendations: Recommendation[];
  } {
    const now = Date.now();
    const timeRange = (timeRangeMinutes || 60) * 60 * 1000;
    const startTime = now - timeRange;

    // Filter metrics by time range
    const relevantMetrics = this.metricsHistory.filter(m => 
      new Date(m.system.timestamp).getTime() >= startTime
    );

    if (relevantMetrics.length === 0) {
      return {
        summary: { message: 'No data available for the specified time range' },
        trends: {},
        alerts: [],
        recommendations: [],
      };
    }

    // Calculate trends
    const trends = this.calculateTrends(relevantMetrics);
    
    // Get recent alerts
    const alerts = this.alertHistory.filter(a => 
      new Date(a.timestamp).getTime() >= startTime
    );

    // Get latest recommendations
    const latest = relevantMetrics[relevantMetrics.length - 1];
    const recommendations = latest.recommendations;

    // Generate summary
    const summary = {
      timeRange: `${timeRangeMinutes || 60} minutes`,
      dataPoints: relevantMetrics.length,
      averageHealthScore: this.calculateAverageHealthScore(relevantMetrics),
      totalAlerts: alerts.length,
      criticalAlerts: alerts.filter(a => a.level === 'critical').length,
      trends: {
        performance: trends.performance?.direction || 'stable',
        memory: trends.memory?.direction || 'stable',
        cache: trends.cache?.direction || 'stable',
      },
    };

    return {
      summary,
      trends,
      alerts,
      recommendations,
    };
  }

  /**
   * Start continuous monitoring
   */
  startMonitoring(intervalMs: number = 60000): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(() => {
      try {
        const metrics = this.getMetrics();
        
        // Log critical alerts
        const criticalAlerts = metrics.alerts.filter(a => a.level === 'critical');
        if (criticalAlerts.length > 0) {
          logger.error('Critical performance alerts detected', { 
            alerts: criticalAlerts.map(a => a.message) 
          });
        }

        // Log health score if degraded
        if (metrics.healthScore < 70) {
          logger.warn('System health degraded', { 
            healthScore: metrics.healthScore,
            alertCount: metrics.alerts.length,
          });
        }
      } catch (error) {
        logger.error('Performance monitoring error', { error });
      }
    }, intervalMs);

    logger.info('Performance monitoring started', { intervalMs });
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
      logger.info('Performance monitoring stopped');
    }
  }

  // Private methods

  private getSystemInfo(): SystemInfo {
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();
    
    return {
      uptime: process.uptime(),
      memory,
      cpu,
      loadAverage: process.platform === 'linux' || process.platform === 'darwin' 
        ? require('os').loadavg() 
        : undefined,
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      pid: process.pid,
      timestamp: new Date().toISOString(),
    };
  }

  private generateAlerts(
    performance: PerformanceStats,
    cache: Record<string, CacheStats>,
    pools: Record<string, any>,
    batchers: Record<string, any>,
    system: SystemInfo
  ): Alert[] {
    const alerts: Alert[] = [];
    const timestamp = new Date().toISOString();

    // Memory alerts
    const heapUsedMB = Math.round(system.memory.heapUsed / 1024 / 1024);
    const rssMB = Math.round(system.memory.rss / 1024 / 1024);

    if (heapUsedMB > this.thresholds.memory.heapUsed) {
      alerts.push({
        level: heapUsedMB > this.thresholds.memory.heapUsed * 1.5 ? 'critical' : 'warning',
        component: 'memory',
        message: `High heap memory usage: ${heapUsedMB}MB`,
        value: heapUsedMB,
        threshold: this.thresholds.memory.heapUsed,
        timestamp,
      });
    }

    if (rssMB > this.thresholds.memory.rss) {
      alerts.push({
        level: rssMB > this.thresholds.memory.rss * 1.5 ? 'critical' : 'warning',
        component: 'memory',
        message: `High RSS memory usage: ${rssMB}MB`,
        value: rssMB,
        threshold: this.thresholds.memory.rss,
        timestamp,
      });
    }

    // Performance alerts
    if (performance.averageDuration > this.thresholds.performance.avgResponseTimeMs) {
      alerts.push({
        level: performance.averageDuration > this.thresholds.performance.avgResponseTimeMs * 2 ? 'error' : 'warning',
        component: 'performance',
        message: `High average response time: ${Math.round(performance.averageDuration)}ms`,
        value: performance.averageDuration,
        threshold: this.thresholds.performance.avgResponseTimeMs,
        timestamp,
      });
    }

    // Cache alerts
    for (const [cacheName, cacheStats] of Object.entries(cache)) {
      if (cacheStats.hitRate < this.thresholds.cache.minHitRate) {
        alerts.push({
          level: cacheStats.hitRate < this.thresholds.cache.minHitRate * 0.5 ? 'error' : 'warning',
          component: `cache:${cacheName}`,
          message: `Low cache hit rate: ${cacheStats.hitRate}%`,
          value: cacheStats.hitRate,
          threshold: this.thresholds.cache.minHitRate,
          timestamp,
        });
      }

      const memorySizeMB = Math.round(cacheStats.size / 1024 / 1024);
      if (memorySizeMB > this.thresholds.cache.maxMemoryMB) {
        alerts.push({
          level: memorySizeMB > this.thresholds.cache.maxMemoryMB * 2 ? 'error' : 'warning',
          component: `cache:${cacheName}`,
          message: `High cache memory usage: ${memorySizeMB}MB`,
          value: memorySizeMB,
          threshold: this.thresholds.cache.maxMemoryMB,
          timestamp,
        });
      }
    }

    // Connection pool alerts
    for (const [poolName, poolStats] of Object.entries(pools)) {
      const pendingRatio = poolStats.total > 0 ? poolStats.pending / poolStats.total : 0;
      
      if (pendingRatio > this.thresholds.pools.maxPendingRatio) {
        alerts.push({
          level: pendingRatio > this.thresholds.pools.maxPendingRatio * 2 ? 'critical' : 'warning',
          component: `pool:${poolName}`,
          message: `High pending connection ratio: ${Math.round(pendingRatio * 100)}%`,
          value: pendingRatio,
          threshold: this.thresholds.pools.maxPendingRatio,
          timestamp,
        });
      }

      if (poolStats.poolHealth === 'unhealthy') {
        alerts.push({
          level: 'critical',
          component: `pool:${poolName}`,
          message: 'Connection pool is unhealthy',
          timestamp,
        });
      }
    }

    // Request batcher alerts
    for (const [batcherName, batcherStats] of Object.entries(batchers)) {
      if (batcherStats.errors > 0) {
        const errorRate = (batcherStats.errors / batcherStats.totalRequests) * 100;
        
        if (errorRate > this.thresholds.batchers.maxErrorRate) {
          alerts.push({
            level: errorRate > this.thresholds.batchers.maxErrorRate * 2 ? 'error' : 'warning',
            component: `batcher:${batcherName}`,
            message: `High error rate: ${Math.round(errorRate)}%`,
            value: errorRate,
            threshold: this.thresholds.batchers.maxErrorRate,
            timestamp,
          });
        }
      }
    }

    return alerts;
  }

  private generateRecommendations(
    performance: PerformanceStats,
    cache: Record<string, CacheStats>,
    pools: Record<string, any>,
    batchers: Record<string, any>
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Cache recommendations
    for (const [cacheName, cacheStats] of Object.entries(cache)) {
      if (cacheStats.hitRate < 60 && cacheStats.hits + cacheStats.misses > 100) {
        recommendations.push({
          component: `cache:${cacheName}`,
          issue: `Low hit rate (${cacheStats.hitRate}%)`,
          suggestion: 'Consider adjusting TTL values or cache keys for better hit rates',
          impact: 'medium',
          effort: 'low',
          priority: 3,
        });
      }

      if (cacheStats.keyCount > 1000) {
        recommendations.push({
          component: `cache:${cacheName}`,
          issue: `High key count (${cacheStats.keyCount})`,
          suggestion: 'Implement cache cleanup or reduce TTL to manage memory usage',
          impact: 'low',
          effort: 'low',
          priority: 2,
        });
      }
    }

    // Performance recommendations
    if (performance.maxDuration > 10000) {
      recommendations.push({
        component: 'performance',
        issue: `Very slow operations detected (${Math.round(performance.maxDuration)}ms)`,
        suggestion: 'Investigate and optimize the slowest operations',
        impact: 'high',
        effort: 'medium',
        priority: 5,
      });
    }

    // Connection pool recommendations
    for (const [poolName, poolStats] of Object.entries(pools)) {
      if (poolStats.averageAcquireTime > 1000) {
        recommendations.push({
          component: `pool:${poolName}`,
          issue: `Slow connection acquisition (${Math.round(poolStats.averageAcquireTime)}ms)`,
          suggestion: 'Consider increasing pool size or optimizing connection creation',
          impact: 'medium',
          effort: 'low',
          priority: 3,
        });
      }

      if (poolStats.timeouts > 5) {
        recommendations.push({
          component: `pool:${poolName}`,
          issue: `Connection timeouts detected (${poolStats.timeouts})`,
          suggestion: 'Increase timeout values or pool size',
          impact: 'high',
          effort: 'low',
          priority: 4,
        });
      }
    }

    // Sort by priority
    return recommendations.sort((a, b) => b.priority - a.priority);
  }

  private calculateHealthScore(
    performance: PerformanceStats,
    cache: Record<string, CacheStats>,
    pools: Record<string, any>,
    batchers: Record<string, any>,
    alerts: Alert[]
  ): number {
    let score = 100;

    // Deduct for alerts
    alerts.forEach(alert => {
      switch (alert.level) {
      case 'critical':
        score -= 20;
        break;
      case 'error':
        score -= 10;
        break;
      case 'warning':
        score -= 5;
        break;
      case 'info':
        score -= 1;
        break;
      }
    });

    // Deduct for poor performance metrics
    if (performance.averageDuration > this.thresholds.performance.avgResponseTimeMs) {
      score -= 10;
    }

    // Deduct for poor cache performance
    for (const cacheStats of Object.values(cache)) {
      if (cacheStats.hitRate < this.thresholds.cache.minHitRate) {
        score -= 5;
      }
    }

    // Deduct for unhealthy pools
    for (const poolStats of Object.values(pools)) {
      if (poolStats.poolHealth === 'unhealthy') {
        score -= 15;
      } else if (poolStats.poolHealth === 'degraded') {
        score -= 5;
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  private updateAlerts(newAlerts: Alert[]): void {
    // Add new alerts to history
    this.alertHistory.push(...newAlerts);
    
    // Limit history size
    if (this.alertHistory.length > 1000) {
      this.alertHistory = this.alertHistory.slice(-1000);
    }

    // Update current alerts
    this.alerts = [...this.alerts.filter(a => a.resolved), ...newAlerts];
  }

  private calculateTrends(metrics: SystemMetrics[]): any {
    if (metrics.length < 2) {
      return {};
    }

    const first = metrics[0];
    const last = metrics[metrics.length - 1];

    return {
      performance: {
        direction: this.getTrendDirection(first.performance.averageDuration, last.performance.averageDuration),
        change: last.performance.averageDuration - first.performance.averageDuration,
      },
      memory: {
        direction: this.getTrendDirection(first.system.memory.heapUsed, last.system.memory.heapUsed),
        change: last.system.memory.heapUsed - first.system.memory.heapUsed,
      },
      cache: {
        direction: this.getTrendDirection(
          this.getAverageCacheHitRate(first.cache),
          this.getAverageCacheHitRate(last.cache)
        ),
        change: this.getAverageCacheHitRate(last.cache) - this.getAverageCacheHitRate(first.cache),
      },
    };
  }

  private getTrendDirection(oldValue: number, newValue: number): 'improving' | 'degrading' | 'stable' {
    const threshold = 0.1; // 10% change threshold
    const changePercent = Math.abs((newValue - oldValue) / oldValue);
    
    if (changePercent < threshold) {
      return 'stable';
    }
    
    return newValue > oldValue ? 'degrading' : 'improving';
  }

  private getAverageCacheHitRate(cacheStats: Record<string, CacheStats>): number {
    const rates = Object.values(cacheStats).map(c => c.hitRate);
    return rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
  }

  private calculateAverageHealthScore(metrics: SystemMetrics[]): number {
    const scores = metrics.map(m => m.healthScore);
    return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  }
}

// Export singleton instance
export const performanceDashboard = PerformanceDashboard.getInstance();