import { UserError } from 'fastmcp';
import { configManager, type AnyListConfig } from './config.js';
import { securityManager } from './security.js';
import { secureCredentialsManager } from './secure-credentials.js';
import { DefaultRateLimiters } from './rate-limiter.js';

export interface AuthenticationResult {
  isAuthenticated: boolean;
  config: AnyListConfig;
  error?: string;
}

export interface AuthenticationOptions {
  email?: string | undefined;
  password?: string | undefined;
  credentialsFile?: string | undefined;
  saveCredentials?: boolean | undefined;
}

export class AuthenticationManager {
  private static instance: AuthenticationManager;
  private isAuthenticated = false;
  private currentConfig: AnyListConfig | null = null;
  private authPromise: Promise<AuthenticationResult> | null = null;

  private constructor() {}

  static getInstance(): AuthenticationManager {
    if (!AuthenticationManager.instance) {
      AuthenticationManager.instance = new AuthenticationManager();
    }
    return AuthenticationManager.instance;
  }

  /**
   * Authenticate with AnyList using various credential sources
   */
  async authenticate(options: AuthenticationOptions = {}): Promise<AuthenticationResult> {
    const identifier = options.email || 'unknown';
    
    // Check rate limiting for authentication attempts
    const authLimiter = DefaultRateLimiters.getAuthLimiter();
    const rateLimitResult = authLimiter.checkRequest({ identifier });
    
    if (!rateLimitResult.allowed) {
      securityManager.auditLog(
        'AUTH_RATE_LIMITED',
        `Authentication rate limited for ${identifier}`,
        'medium'
      );
      throw new UserError(`Authentication rate limited. Try again in ${rateLimitResult.retryAfter} seconds.`);
    }

    // Return existing authentication if already in progress
    if (this.authPromise) {
      return this.authPromise;
    }

    // Return cached authentication if already authenticated
    if (this.isAuthenticated && this.currentConfig) {
      return {
        isAuthenticated: true,
        config: this.currentConfig,
      };
    }

    this.authPromise = this._authenticate(options);
    return this.authPromise;
  }

  private async _authenticate(options: AuthenticationOptions): Promise<AuthenticationResult> {
    const identifier = options.email || 'unknown';
    const authLimiter = DefaultRateLimiters.getAuthLimiter();
    
    try {
      // Validate input credentials
      if (options.email && !securityManager.validateInput(options.email, 'email')) {
        authLimiter.recordRequest(identifier, false);
        throw new UserError('Invalid email format');
      }
      
      if (options.password && !securityManager.validateInput(options.password, 'password')) {
        authLimiter.recordRequest(identifier, false);
        throw new UserError('Invalid password format');
      }

      // Load configuration from all sources
      const config = await configManager.loadConfig({
        email: options.email || undefined,
        password: options.password || undefined,
        credentialsFile: options.credentialsFile || undefined,
      });

      // Validate that we have required credentials
      if (!config.email || !config.password) {
        authLimiter.recordRequest(identifier, false);
        securityManager.auditLog(
          'AUTH_MISSING_CREDENTIALS',
          `Authentication failed: missing credentials for ${identifier}`,
          'medium'
        );
        throw new UserError('Email and password are required for authentication');
      }

      // Save credentials securely if requested
      if (options.saveCredentials && options.email && options.password) {
        try {
          await secureCredentialsManager.saveCredentials(
            { 
              email: options.email, 
              password: options.password,
              timestamp: new Date().toISOString(),
              lastUsed: new Date().toISOString(),
            },
            { 
              filePath: options.credentialsFile,
              backupOnSave: true,
            }
          );
          
          securityManager.auditLog(
            'CREDENTIALS_SAVED_SECURELY',
            `Secure credentials saved for ${identifier}`,
            'low'
          );
        } catch (saveError) {
          // Log error but don't fail authentication
          securityManager.auditLog(
            'CREDENTIALS_SAVE_FAILED',
            `Failed to save secure credentials for ${identifier}: ${saveError instanceof Error ? saveError.message : String(saveError)}`,
            'medium'
          );
        }
      }

      // Store successful authentication
      this.isAuthenticated = true;
      this.currentConfig = config;
      this.authPromise = null;
      
      // Record successful authentication
      authLimiter.recordRequest(identifier, true);
      securityManager.auditLog(
        'AUTH_SUCCESS',
        `Successful authentication for ${config.email}`,
        'low'
      );

      return {
        isAuthenticated: true,
        config,
      };
    } catch (error) {
      this.isAuthenticated = false;
      this.currentConfig = null;
      this.authPromise = null;
      
      // Record failed authentication
      authLimiter.recordRequest(identifier, false);
      securityManager.auditLog(
        'AUTH_FAILED',
        `Authentication failed for ${identifier}: ${error instanceof Error ? error.message : String(error)}`,
        'medium'
      );

      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        isAuthenticated: false,
        config: {} as AnyListConfig,
        error: errorMessage,
      };
    }
  }

  /**
   * Check if currently authenticated
   */
  isAuthenticatedSync(): boolean {
    return this.isAuthenticated;
  }

  /**
   * Get current authentication configuration
   */
  getCurrentConfig(): AnyListConfig | null {
    return this.currentConfig;
  }

  /**
   * Clear authentication state
   */
  clearAuthentication(): void {
    this.isAuthenticated = false;
    this.currentConfig = null;
    this.authPromise = null;
    configManager.clearConfig();
  }

  /**
   * Refresh authentication with current or new credentials
   */
  async refreshAuthentication(options: AuthenticationOptions = {}): Promise<AuthenticationResult> {
    this.clearAuthentication();
    return this.authenticate(options);
  }

  /**
   * Get authentication status with detailed information
   */
  getAuthenticationStatus(): {
    isAuthenticated: boolean;
    hasCredentialsFile: boolean;
    hasEnvironmentVars: boolean;
    configSource: string;
    } {
    const hasCredentialsFile = configManager.credentialsFileExists();
    const hasEnvironmentVars = !!(process.env['ANYLIST_EMAIL'] && process.env['ANYLIST_PASSWORD']);
    
    let configSource = 'none';
    if (this.currentConfig) {
      if (hasEnvironmentVars) {
        configSource = 'environment';
      } else if (hasCredentialsFile) {
        configSource = 'credentials_file';
      } else {
        configSource = 'runtime';
      }
    }

    return {
      isAuthenticated: this.isAuthenticated,
      hasCredentialsFile,
      hasEnvironmentVars,
      configSource,
    };
  }

  /**
   * Validate credentials without saving authentication state
   */
  async validateCredentials(email: string, password: string): Promise<{ isValid: boolean; error?: string }> {
    try {
      configManager.validateConfig({ email, password });
      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Singleton instance for easy access
 */
export const authManager = AuthenticationManager.getInstance();