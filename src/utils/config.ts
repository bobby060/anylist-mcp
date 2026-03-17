import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { UserError } from 'fastmcp';
import { secureCredentialsManager } from './secure-credentials.js';

// Configuration schema validation
const AnyListConfigSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  credentialsFile: z.string().optional(),
  apiBaseUrl: z.string().url().optional(),
  timeout: z.number().positive().optional(),
  retryAttempts: z.number().min(0).max(10).optional(),
  retryDelay: z.number().positive().optional(),
});

const EnvironmentConfigSchema = z.object({
  ANYLIST_EMAIL: z.string().email('Invalid email address').optional(),
  ANYLIST_PASSWORD: z.string().min(1, 'Password is required').optional(),
  ANYLIST_CREDENTIALS_FILE: z.string().optional(),
  ANYLIST_API_BASE_URL: z.string().url().optional(),
  ANYLIST_TIMEOUT: z.string().transform((val) => parseInt(val, 10)).optional(),
  ANYLIST_RETRY_ATTEMPTS: z.string().transform((val) => parseInt(val, 10)).optional(),
  ANYLIST_RETRY_DELAY: z.string().transform((val) => parseInt(val, 10)).optional(),
  // Server configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).optional(),
  LOG_DIR: z.string().optional(),
  MCP_SERVER_NAME: z.string().optional(),
  MCP_SERVER_VERSION: z.string().optional(),
  HEALTH_CHECK_INTERVAL: z.string().transform((val) => parseInt(val, 10)).optional(),
  PERFORMANCE_MONITORING: z.string().transform((val) => val === 'true').optional(),
});

export type AnyListConfig = z.infer<typeof AnyListConfigSchema>;
export type EnvironmentConfig = z.infer<typeof EnvironmentConfigSchema>;

export interface ConfigurationOptions {
  // Priority order: passed config > environment variables > credentials file > defaults
  email?: string | undefined;
  password?: string | undefined;
  credentialsFile?: string | undefined;
  apiBaseUrl?: string | undefined;
  timeout?: number | undefined;
  retryAttempts?: number | undefined;
  retryDelay?: number | undefined;
}

export class ConfigurationManager {
  private static instance: ConfigurationManager;
  private config: AnyListConfig | null = null;
  private readonly defaultCredentialsFile = join(homedir(), '.anylist_credentials');

  private constructor() {}

  static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  /**
   * Load configuration from multiple sources with priority order:
   * 1. Passed configuration options
   * 2. Environment variables
   * 3. Credentials file
   * 4. Default values
   */
  async loadConfig(options: ConfigurationOptions = {}): Promise<AnyListConfig> {
    try {
      // Load from environment variables
      const envConfig = this.loadFromEnvironment();
      
      // Load from credentials file
      const credentialsFile = options.credentialsFile || envConfig.ANYLIST_CREDENTIALS_FILE || this.defaultCredentialsFile;
      const fileConfig = await this.loadFromCredentialsFile(credentialsFile);

      // Merge configurations with priority order
      const mergedConfig = {
        email: options.email || envConfig.ANYLIST_EMAIL || fileConfig.email,
        password: options.password || envConfig.ANYLIST_PASSWORD || fileConfig.password,
        credentialsFile: credentialsFile,
        apiBaseUrl: options.apiBaseUrl || envConfig.ANYLIST_API_BASE_URL || fileConfig.apiBaseUrl,
        timeout: options.timeout || envConfig.ANYLIST_TIMEOUT || fileConfig.timeout || 30000,
        retryAttempts: options.retryAttempts || envConfig.ANYLIST_RETRY_ATTEMPTS || fileConfig.retryAttempts || 3,
        retryDelay: options.retryDelay || envConfig.ANYLIST_RETRY_DELAY || fileConfig.retryDelay || 1000,
      };

      // Validate the merged configuration
      const validatedConfig = AnyListConfigSchema.parse(mergedConfig);
      this.config = validatedConfig;
      
      return validatedConfig;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`);
        throw new UserError(`Invalid configuration: ${issues.join(', ')}`);
      }
      throw new UserError(`Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Load configuration from environment variables
   */
  private loadFromEnvironment(): Partial<EnvironmentConfig> {
    const envVars = {
      ANYLIST_EMAIL: process.env['ANYLIST_EMAIL'],
      ANYLIST_PASSWORD: process.env['ANYLIST_PASSWORD'],
      ANYLIST_CREDENTIALS_FILE: process.env['ANYLIST_CREDENTIALS_FILE'],
      ANYLIST_API_BASE_URL: process.env['ANYLIST_API_BASE_URL'],
      ANYLIST_TIMEOUT: process.env['ANYLIST_TIMEOUT'],
      ANYLIST_RETRY_ATTEMPTS: process.env['ANYLIST_RETRY_ATTEMPTS'],
      ANYLIST_RETRY_DELAY: process.env['ANYLIST_RETRY_DELAY'],
    };

    // Remove undefined values
    const cleanedEnvVars = Object.fromEntries(
      Object.entries(envVars).filter(([_, value]) => value !== undefined)
    );

    try {
      return EnvironmentConfigSchema.parse(cleanedEnvVars);
    } catch (error) {
      // If environment validation fails, return empty object
      return {};
    }
  }

  /**
   * Load configuration from credentials file (supports both encrypted and legacy formats)
   */
  private async loadFromCredentialsFile(credentialsFile: string): Promise<Partial<AnyListConfig>> {
    if (!existsSync(credentialsFile)) {
      return {};
    }

    try {
      // First try to load as encrypted credentials
      if (credentialsFile.includes('encrypted') || process.env.ANYLIST_ENCRYPTION_KEY) {
        try {
          const secureCredentials = await secureCredentialsManager.loadCredentials({
            filePath: credentialsFile,
            validateOnLoad: false,
          });
          
          if (secureCredentials) {
            return {
              email: secureCredentials.email,
              password: secureCredentials.password,
            };
          }
        } catch (encryptionError) {
          // Fall back to legacy format if encryption fails
          console.warn('Failed to load encrypted credentials, trying legacy format:', encryptionError);
        }
      }

      // Fall back to legacy unencrypted format
      const fileContent = readFileSync(credentialsFile, 'utf8');
      const parsed = JSON.parse(fileContent);
      return parsed;
    } catch (error) {
      // If file reading fails, return empty object
      return {};
    }
  }

  /**
   * Save credentials to file
   */
  async saveCredentials(credentials: { email: string; password: string }, credentialsFile?: string): Promise<void> {
    const filePath = credentialsFile || this.defaultCredentialsFile;
    
    try {
      const configData = {
        email: credentials.email,
        password: credentials.password,
        timestamp: new Date().toISOString(),
      };

      writeFileSync(filePath, JSON.stringify(configData, null, 2), { 
        mode: 0o600, // Read/write for owner only
        encoding: 'utf8' 
      });
    } catch (error) {
      throw new UserError(`Failed to save credentials: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get the current configuration
   */
  getConfig(): AnyListConfig | null {
    return this.config;
  }

  /**
   * Clear cached configuration
   */
  clearConfig(): void {
    this.config = null;
  }

  /**
   * Validate configuration without loading
   */
  validateConfig(config: unknown): AnyListConfig {
    return AnyListConfigSchema.parse(config);
  }

  /**
   * Check if credentials file exists
   */
  credentialsFileExists(credentialsFile?: string): boolean {
    const filePath = credentialsFile || this.defaultCredentialsFile;
    return existsSync(filePath);
  }

  /**
   * Remove credentials file
   */
  removeCredentialsFile(credentialsFile?: string): void {
    const filePath = credentialsFile || this.defaultCredentialsFile;
    if (existsSync(filePath)) {
      try {
        require('fs').unlinkSync(filePath);
      } catch (error) {
        throw new UserError(`Failed to remove credentials file: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Get server configuration settings
   */
  getServerConfig() {
    const envConfig = this.loadFromEnvironment();
    
    return {
      nodeEnv: envConfig.NODE_ENV || 'development',
      logLevel: envConfig.LOG_LEVEL || 'info',
      logDir: envConfig.LOG_DIR || join(homedir(), '.anylist-mcp', 'logs'),
      serverName: envConfig.MCP_SERVER_NAME || 'AnyList MCP Server',
      serverVersion: envConfig.MCP_SERVER_VERSION || '1.0.0',
      healthCheckInterval: envConfig.HEALTH_CHECK_INTERVAL || 60000,
      performanceMonitoring: envConfig.PERFORMANCE_MONITORING || false,
    };
  }

  /**
   * Check if running in production mode
   */
  isProduction(): boolean {
    return this.getServerConfig().nodeEnv === 'production';
  }

  /**
   * Get log level
   */
  getLogLevel(): 'error' | 'warn' | 'info' | 'http' | 'debug' {
    return this.getServerConfig().logLevel;
  }

  /**
   * Get log directory and ensure it exists
   */
  getLogDirectory(): string {
    const logDir = this.getServerConfig().logDir;
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
    return logDir;
  }

  /**
   * Get server name
   */
  getServerName(): string {
    return this.getServerConfig().serverName;
  }

  /**
   * Get server version
   */
  getServerVersion(): string {
    return this.getServerConfig().serverVersion;
  }

  /**
   * Get health check interval
   */
  getHealthCheckInterval(): number {
    return this.getServerConfig().healthCheckInterval;
  }

  /**
   * Check if performance monitoring is enabled
   */
  isPerformanceMonitoringEnabled(): boolean {
    return this.getServerConfig().performanceMonitoring;
  }
}

/**
 * Singleton instance for easy access
 */
export const configManager = ConfigurationManager.getInstance();

/**
 * Convenience reference to configuration methods
 */
export const config = configManager;