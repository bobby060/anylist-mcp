import { UserError } from 'fastmcp';
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { securityManager, type EncryptionResult } from './security.js';

export interface SecureCredentialsData {
  email: string;
  password: string;
  timestamp?: string;
  lastUsed?: string;
  version?: string;
}

export interface EncryptedCredentialsFile {
  encryptedData: string;
  salt: string;
  iv: string;
  algorithm: string;
  keyDerivationIterations: number;
  version: string;
  timestamp: string;
  checksum: string;
}

export interface SecureCredentialsOptions {
  filePath?: string | undefined;
  encryptionKey?: string | undefined;
  autoSave?: boolean | undefined;
  validateOnLoad?: boolean | undefined;
  backupOnSave?: boolean | undefined;
}

export class SecureCredentialsManager {
  private static instance: SecureCredentialsManager;
  private readonly defaultCredentialsPath = join(homedir(), '.anylist_credentials_encrypted');
  private readonly defaultBackupPath = join(homedir(), '.anylist_credentials_backup');
  private readonly currentVersion = '1.0.0';

  private constructor() {}

  static getInstance(): SecureCredentialsManager {
    if (!SecureCredentialsManager.instance) {
      SecureCredentialsManager.instance = new SecureCredentialsManager();
    }
    return SecureCredentialsManager.instance;
  }

  /**
   * Save credentials to encrypted file with secure permissions
   */
  async saveCredentials(
    credentials: SecureCredentialsData,
    options: SecureCredentialsOptions = {}
  ): Promise<void> {
    const filePath = options.filePath || this.defaultCredentialsPath;
    const encryptionKey = options.encryptionKey || process.env.ANYLIST_ENCRYPTION_KEY;
    
    try {
      // Validate input
      if (!credentials.email || !credentials.password) {
        throw new UserError('Email and password are required');
      }

      // Validate email format
      if (!securityManager.validateInput(credentials.email, 'email')) {
        throw new UserError('Invalid email format');
      }

      // Validate password
      if (!securityManager.validateInput(credentials.password, 'password')) {
        throw new UserError('Invalid password format');
      }

      if (!encryptionKey) {
        throw new UserError('Encryption key is required. Set ANYLIST_ENCRYPTION_KEY environment variable.');
      }

      // Prepare credentials data
      const credentialsData: SecureCredentialsData = {
        email: credentials.email,
        password: credentials.password,
        timestamp: new Date().toISOString(),
        lastUsed: new Date().toISOString(),
        version: this.currentVersion,
      };

      // Encrypt credentials
      const jsonData = JSON.stringify(credentialsData);
      const encryptionResult = await securityManager.encryptData(jsonData, encryptionKey);
      
      // Create checksum for integrity verification
      const checksum = await this.createChecksum(jsonData);

      // Prepare encrypted file data
      const encryptedFile: EncryptedCredentialsFile = {
        ...encryptionResult,
        version: this.currentVersion,
        timestamp: new Date().toISOString(),
        checksum,
      };

      // Create backup if requested
      if (options.backupOnSave && existsSync(filePath)) {
        const backupPath = options.filePath 
          ? `${options.filePath}.backup` 
          : this.defaultBackupPath;
        
        try {
          const existingContent = readFileSync(filePath);
          writeFileSync(backupPath, existingContent, { mode: 0o600 });
        } catch (error) {
          console.warn('Failed to create backup:', error);
        }
      }

      // Write encrypted file
      const encryptedContent = JSON.stringify(encryptedFile, null, 2);
      writeFileSync(filePath, encryptedContent, { 
        encoding: 'utf8',
        mode: 0o600 // Owner read/write only
      });

      // Ensure file permissions are secure
      chmodSync(filePath, 0o600);

      securityManager.auditLog(
        'CREDENTIALS_SAVED',
        `Encrypted credentials saved to ${filePath}`,
        'low'
      );
    } catch (error) {
      securityManager.auditLog(
        'CREDENTIALS_SAVE_FAILED',
        `Failed to save credentials: ${error instanceof Error ? error.message : String(error)}`,
        'high'
      );
      throw new UserError(`Failed to save credentials: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Load credentials from encrypted file
   */
  async loadCredentials(
    options: SecureCredentialsOptions = {}
  ): Promise<SecureCredentialsData | null> {
    const filePath = options.filePath || this.defaultCredentialsPath;
    const encryptionKey = options.encryptionKey || process.env.ANYLIST_ENCRYPTION_KEY;
    
    try {
      if (!existsSync(filePath)) {
        return null;
      }

      if (!encryptionKey) {
        throw new UserError('Encryption key is required. Set ANYLIST_ENCRYPTION_KEY environment variable.');
      }

      // Read encrypted file
      const fileContent = readFileSync(filePath, 'utf8');
      const encryptedFile = JSON.parse(fileContent) as EncryptedCredentialsFile;

      // Validate file structure
      if (!encryptedFile.encryptedData || !encryptedFile.salt || !encryptedFile.iv) {
        throw new UserError('Invalid encrypted credentials file format');
      }

      // Decrypt credentials
      const decryptedData = await securityManager.decryptData({
        encryptedData: encryptedFile.encryptedData,
        salt: encryptedFile.salt,
        iv: encryptedFile.iv,
        algorithm: encryptedFile.algorithm,
        keyDerivationIterations: encryptedFile.keyDerivationIterations,
        key: encryptionKey,
      });

      const credentials = JSON.parse(decryptedData) as SecureCredentialsData;

      // Verify checksum for integrity
      if (encryptedFile.checksum) {
        const expectedChecksum = await this.createChecksum(decryptedData);
        if (encryptedFile.checksum !== expectedChecksum) {
          throw new UserError('Credentials file integrity check failed');
        }
      }

      // Validate loaded data
      if (options.validateOnLoad) {
        if (!credentials.email || !credentials.password) {
          throw new UserError('Invalid credentials file: missing email or password');
        }

        if (!securityManager.validateInput(credentials.email, 'email')) {
          throw new UserError('Invalid credentials file: invalid email format');
        }

        if (!securityManager.validateInput(credentials.password, 'password')) {
          throw new UserError('Invalid credentials file: invalid password format');
        }
      }

      // Update last used timestamp if auto-save is enabled
      if (options.autoSave) {
        credentials.lastUsed = new Date().toISOString();
        await this.saveCredentials(credentials, options);
      }

      securityManager.auditLog(
        'CREDENTIALS_LOADED',
        `Encrypted credentials loaded from ${filePath}`,
        'low'
      );

      return credentials;
    } catch (error) {
      securityManager.auditLog(
        'CREDENTIALS_LOAD_FAILED',
        `Failed to load credentials: ${error instanceof Error ? error.message : String(error)}`,
        'high'
      );
      
      if (error instanceof UserError) {
        throw error;
      }
      throw new UserError(`Failed to load credentials: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if encrypted credentials file exists
   */
  credentialsExist(filePath?: string): boolean {
    const path = filePath || this.defaultCredentialsPath;
    return existsSync(path);
  }

  /**
   * Remove encrypted credentials file
   */
  async removeCredentials(filePath?: string): Promise<void> {
    const path = filePath || this.defaultCredentialsPath;
    
    try {
      if (existsSync(path)) {
        require('fs').unlinkSync(path);
        securityManager.auditLog(
          'CREDENTIALS_REMOVED',
          `Encrypted credentials removed from ${path}`,
          'medium'
        );
      }
    } catch (error) {
      securityManager.auditLog(
        'CREDENTIALS_REMOVAL_FAILED',
        `Failed to remove credentials: ${error instanceof Error ? error.message : String(error)}`,
        'high'
      );
      throw new UserError(`Failed to remove credentials: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Update credentials in existing encrypted file
   */
  async updateCredentials(
    updates: Partial<SecureCredentialsData>,
    options: SecureCredentialsOptions = {}
  ): Promise<void> {
    const filePath = options.filePath || this.defaultCredentialsPath;
    
    try {
      const existing = await this.loadCredentials({ ...options, filePath, validateOnLoad: false });
      if (!existing) {
        throw new UserError('No existing credentials file found');
      }

      const updated: SecureCredentialsData = {
        ...existing,
        ...updates,
        timestamp: existing.timestamp || new Date().toISOString(),
        lastUsed: new Date().toISOString(),
        version: this.currentVersion,
      };

      await this.saveCredentials(updated, options);
    } catch (error) {
      if (error instanceof UserError) {
        throw error;
      }
      throw new UserError(`Failed to update credentials: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get encrypted credentials file information
   */
  getCredentialsInfo(filePath?: string): {
    exists: boolean;
    path: string;
    size?: number;
    modified?: Date;
    version?: string;
    encrypted: boolean;
  } {
    const path = filePath || this.defaultCredentialsPath;
    const exists = existsSync(path);
    
    if (!exists) {
      return { exists: false, path, encrypted: true };
    }

    try {
      const stats = require('fs').statSync(path);
      const fileContent = readFileSync(path, 'utf8');
      const parsed = JSON.parse(fileContent) as EncryptedCredentialsFile;
      
      return {
        exists: true,
        path,
        size: stats.size,
        modified: stats.mtime,
        version: parsed.version,
        encrypted: true,
      };
    } catch (error) {
      return { exists: false, path, encrypted: true };
    }
  }

  /**
   * Verify encrypted credentials file integrity
   */
  async verifyCredentialsIntegrity(
    filePath?: string,
    encryptionKey?: string
  ): Promise<{
    isValid: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const path = filePath || this.defaultCredentialsPath;
    const key = encryptionKey || process.env.ANYLIST_ENCRYPTION_KEY;
    const issues: string[] = [];
    const recommendations: string[] = [];

    try {
      if (!existsSync(path)) {
        issues.push('Credentials file does not exist');
        recommendations.push('Create encrypted credentials file');
        return { isValid: false, issues, recommendations };
      }

      if (!key) {
        issues.push('Encryption key not available');
        recommendations.push('Set ANYLIST_ENCRYPTION_KEY environment variable');
        return { isValid: false, issues, recommendations };
      }

      // Check file permissions
      const stats = require('fs').statSync(path);
      const permissions = (stats.mode & parseInt('777', 8)).toString(8);
      if (permissions !== '600') {
        issues.push(`Insecure file permissions: ${permissions}`);
        recommendations.push('Change file permissions to 600 (owner only)');
      }

      // Try to load and decrypt
      const credentials = await this.loadCredentials({
        filePath: path,
        encryptionKey: key,
        validateOnLoad: true,
      });

      if (!credentials) {
        issues.push('Failed to decrypt credentials');
        recommendations.push('Verify encryption key is correct');
        return { isValid: false, issues, recommendations };
      }

      // Check for version compatibility
      if (credentials.version && credentials.version !== this.currentVersion) {
        issues.push(`Version mismatch: ${credentials.version} (current: ${this.currentVersion})`);
        recommendations.push('Update credentials file to current version');
      }

      const isValid = issues.length === 0;
      return { isValid, issues, recommendations };
    } catch (error) {
      issues.push(`Integrity check failed: ${error instanceof Error ? error.message : String(error)}`);
      recommendations.push('Recreate credentials file if corrupted');
      return { isValid: false, issues, recommendations };
    }
  }

  /**
   * Migrate from old unencrypted credentials to encrypted format
   */
  async migrateFromUnencrypted(
    oldFilePath: string,
    options: SecureCredentialsOptions = {}
  ): Promise<void> {
    try {
      if (!existsSync(oldFilePath)) {
        throw new UserError('Old credentials file not found');
      }

      // Read old unencrypted file
      const oldContent = readFileSync(oldFilePath, 'utf8');
      const oldCredentials = JSON.parse(oldContent);

      // Validate old credentials
      if (!oldCredentials.email || !oldCredentials.password) {
        throw new UserError('Invalid old credentials file format');
      }

      // Save as encrypted
      await this.saveCredentials(
        {
          email: oldCredentials.email,
          password: oldCredentials.password,
          timestamp: oldCredentials.timestamp,
          lastUsed: oldCredentials.lastUsed,
        },
        { ...options, backupOnSave: true }
      );

      // Remove old unencrypted file
      require('fs').unlinkSync(oldFilePath);

      securityManager.auditLog(
        'CREDENTIALS_MIGRATED',
        `Credentials migrated from ${oldFilePath} to encrypted format`,
        'medium'
      );
    } catch (error) {
      securityManager.auditLog(
        'CREDENTIALS_MIGRATION_FAILED',
        `Failed to migrate credentials: ${error instanceof Error ? error.message : String(error)}`,
        'high'
      );
      throw new UserError(`Failed to migrate credentials: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create checksum for integrity verification
   */
  private async createChecksum(data: string): Promise<string> {
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}

/**
 * Singleton instance for easy access
 */
export const secureCredentialsManager = SecureCredentialsManager.getInstance();