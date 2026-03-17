import { UserError } from 'fastmcp';
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface CredentialsData {
  email: string;
  password: string;
  timestamp?: string;
  lastUsed?: string;
}

export interface CredentialsOptions {
  filePath?: string | undefined;
  autoSave?: boolean | undefined;
  validateOnLoad?: boolean | undefined;
}

export class CredentialsManager {
  private static instance: CredentialsManager;
  private readonly defaultCredentialsPath = join(homedir(), '.anylist_credentials');

  private constructor() {}

  static getInstance(): CredentialsManager {
    if (!CredentialsManager.instance) {
      CredentialsManager.instance = new CredentialsManager();
    }
    return CredentialsManager.instance;
  }

  /**
   * Save credentials to file with secure permissions
   */
  async saveCredentials(credentials: CredentialsData, options: CredentialsOptions = {}): Promise<void> {
    const filePath = options.filePath || this.defaultCredentialsPath;
    
    try {
      // Validate input
      if (!credentials.email || !credentials.password) {
        throw new UserError('Email and password are required');
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(credentials.email)) {
        throw new UserError('Invalid email format');
      }

      // Prepare credentials data
      const credentialsData: CredentialsData = {
        email: credentials.email,
        password: credentials.password,
        timestamp: new Date().toISOString(),
        lastUsed: new Date().toISOString(),
      };

      // Write to file
      const jsonData = JSON.stringify(credentialsData, null, 2);
      writeFileSync(filePath, jsonData, { 
        encoding: 'utf8',
        mode: 0o600 // Owner read/write only
      });

      // Ensure file permissions are secure (owner only)
      chmodSync(filePath, 0o600);
    } catch (error) {
      throw new UserError(`Failed to save credentials: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Load credentials from file
   */
  async loadCredentials(options: CredentialsOptions = {}): Promise<CredentialsData | null> {
    const filePath = options.filePath || this.defaultCredentialsPath;
    
    try {
      if (!existsSync(filePath)) {
        return null;
      }

      const fileContent = readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(fileContent) as CredentialsData;

      // Validate loaded data
      if (options.validateOnLoad) {
        if (!parsed.email || !parsed.password) {
          throw new UserError('Invalid credentials file: missing email or password');
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(parsed.email)) {
          throw new UserError('Invalid credentials file: invalid email format');
        }
      }

      // Update last used timestamp if auto-save is enabled
      if (options.autoSave) {
        parsed.lastUsed = new Date().toISOString();
        await this.saveCredentials(parsed, { filePath });
      }

      return parsed;
    } catch (error) {
      if (error instanceof UserError) {
        throw error;
      }
      throw new UserError(`Failed to load credentials: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if credentials file exists
   */
  credentialsExist(filePath?: string): boolean {
    const path = filePath || this.defaultCredentialsPath;
    return existsSync(path);
  }

  /**
   * Remove credentials file
   */
  async removeCredentials(filePath?: string): Promise<void> {
    const path = filePath || this.defaultCredentialsPath;
    
    try {
      if (existsSync(path)) {
        require('fs').unlinkSync(path);
      }
    } catch (error) {
      throw new UserError(`Failed to remove credentials: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Update credentials in existing file
   */
  async updateCredentials(updates: Partial<CredentialsData>, options: CredentialsOptions = {}): Promise<void> {
    const filePath = options.filePath || this.defaultCredentialsPath;
    
    try {
      const existing = await this.loadCredentials({ filePath, validateOnLoad: false });
      if (!existing) {
        throw new UserError('No existing credentials file found');
      }

      const updated: CredentialsData = {
        ...existing,
        ...updates,
        timestamp: existing.timestamp || new Date().toISOString(),
        lastUsed: new Date().toISOString(),
      };

      await this.saveCredentials(updated, { filePath });
    } catch (error) {
      if (error instanceof UserError) {
        throw error;
      }
      throw new UserError(`Failed to update credentials: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get credentials file information
   */
  getCredentialsInfo(filePath?: string): {
    exists: boolean;
    path: string;
    size?: number;
    modified?: Date;
  } {
    const path = filePath || this.defaultCredentialsPath;
    const exists = existsSync(path);
    
    if (!exists) {
      return { exists: false, path };
    }

    try {
      const stats = require('fs').statSync(path);
      return {
        exists: true,
        path,
        size: stats.size,
        modified: stats.mtime,
      };
    } catch (error) {
      return { exists: false, path };
    }
  }

  /**
   * Verify credentials file permissions
   */
  verifyCredentialsPermissions(filePath?: string): {
    isSecure: boolean;
    permissions: string;
    recommendations: string[];
  } {
    const path = filePath || this.defaultCredentialsPath;
    const recommendations: string[] = [];
    
    try {
      if (!existsSync(path)) {
        return {
          isSecure: false,
          permissions: 'not_found',
          recommendations: ['Create credentials file'],
        };
      }

      const stats = require('fs').statSync(path);
      const permissions = (stats.mode & parseInt('777', 8)).toString(8);
      
      let isSecure = true;
      
      // Check if readable by group or others
      if (permissions !== '600') {
        isSecure = false;
        recommendations.push('Change permissions to 600 (owner read/write only)');
      }

      return {
        isSecure,
        permissions,
        recommendations,
      };
    } catch (error) {
      return {
        isSecure: false,
        permissions: 'unknown',
        recommendations: ['Check file permissions manually'],
      };
    }
  }

  /**
   * Fix credentials file permissions
   */
  async fixCredentialsPermissions(filePath?: string): Promise<void> {
    const path = filePath || this.defaultCredentialsPath;
    
    try {
      if (existsSync(path)) {
        chmodSync(path, 0o600);
      }
    } catch (error) {
      throw new UserError(`Failed to fix permissions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Singleton instance for easy access
 */
export const credentialsManager = CredentialsManager.getInstance();