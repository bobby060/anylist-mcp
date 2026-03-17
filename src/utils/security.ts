import crypto from 'crypto';
import CryptoJS from 'crypto-js';
import { UserError } from 'fastmcp';
import { join } from 'path';
import { homedir } from 'os';

export interface SecurityConfig {
  encryptionKey?: string;
  saltRounds?: number;
  keyDerivationIterations?: number;
  algorithm?: string;
  tokenExpiration?: number;
  maxRetries?: number;
  lockoutDuration?: number;
}

export interface EncryptionResult {
  encryptedData: string;
  salt: string;
  iv: string;
  algorithm: string;
  keyDerivationIterations: number;
}

export interface DecryptionOptions {
  encryptedData: string;
  salt: string;
  iv: string;
  algorithm: string;
  keyDerivationIterations: number;
  key: string;
}

export interface RequestSignature {
  signature: string;
  timestamp: string;
  nonce: string;
}

export interface SecurityAuditLog {
  timestamp: string;
  event: string;
  details: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  sourceIp?: string;
  userAgent?: string;
}

export class SecurityManager {
  private static instance: SecurityManager;
  private readonly config: SecurityConfig;
  private readonly auditLogs: SecurityAuditLog[] = [];
  private readonly failedAttempts: Map<string, { count: number; lastAttempt: Date }> = new Map();
  private readonly securityKeyPath = join(homedir(), '.anylist_security_key');

  private constructor(config: SecurityConfig = {}) {
    this.config = {
      encryptionKey: config.encryptionKey || process.env.ANYLIST_ENCRYPTION_KEY || (process.env.NODE_ENV !== 'test' ? this.generateSecurityKey() : undefined),
      saltRounds: config.saltRounds || 12,
      keyDerivationIterations: config.keyDerivationIterations || 100000,
      algorithm: config.algorithm || 'aes-256-cbc',
      tokenExpiration: config.tokenExpiration || 3600000, // 1 hour
      maxRetries: config.maxRetries || 3,
      lockoutDuration: config.lockoutDuration || 900000, // 15 minutes
      ...config,
    };
  }

  static getInstance(config?: SecurityConfig): SecurityManager {
    if (!SecurityManager.instance) {
      SecurityManager.instance = new SecurityManager(config);
    }
    return SecurityManager.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  static resetInstance(): void {
    SecurityManager.instance = null as any;
  }

  /**
   * Generate a secure encryption key
   */
  private generateSecurityKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Derive encryption key from password using PBKDF2
   */
  private deriveKey(password: string, salt: string, iterations: number): string {
    return CryptoJS.PBKDF2(password, salt, {
      keySize: 256 / 32,
      iterations: iterations,
      hasher: CryptoJS.algo.SHA256,
    }).toString();
  }

  /**
   * Encrypt sensitive data using AES-256-CBC
   */
  async encryptData(data: string, masterKey?: string): Promise<EncryptionResult> {
    try {
      const key = masterKey || this.config.encryptionKey;
      if (!key) {
        throw new UserError('Encryption key is required');
      }

      const salt = crypto.randomBytes(16).toString('hex');
      const iv = crypto.randomBytes(16).toString('hex');
      const iterations = this.config.keyDerivationIterations!;
      
      const derivedKey = this.deriveKey(key, salt, iterations);
      
      // Use CBC mode with PKCS7 padding for better compatibility
      const encrypted = CryptoJS.AES.encrypt(data, derivedKey, {
        iv: CryptoJS.enc.Hex.parse(iv),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });

      const result: EncryptionResult = {
        encryptedData: encrypted.toString(),
        salt,
        iv,
        algorithm: 'aes-256-cbc',
        keyDerivationIterations: iterations,
      };

      this.auditLog('DATA_ENCRYPTED', 'Data encrypted using AES-256-CBC', 'low');
      return result;
    } catch (error) {
      this.auditLog('ENCRYPTION_FAILED', `Encryption failed: ${error instanceof Error ? error.message : String(error)}`, 'high');
      throw new UserError(`Encryption failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Decrypt sensitive data
   */
  async decryptData(options: DecryptionOptions): Promise<string> {
    try {
      const derivedKey = this.deriveKey(options.key, options.salt, options.keyDerivationIterations);
      
      // Use CBC mode with PKCS7 padding to match encryption
      const decrypted = CryptoJS.AES.decrypt(options.encryptedData, derivedKey, {
        iv: CryptoJS.enc.Hex.parse(options.iv),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });

      const decryptedString = decrypted.toString(CryptoJS.enc.Utf8);
      if (!decryptedString) {
        throw new UserError('Decryption failed: Invalid key or corrupted data');
      }

      this.auditLog('DATA_DECRYPTED', 'Data decrypted successfully', 'low');
      return decryptedString;
    } catch (error) {
      this.auditLog('DECRYPTION_FAILED', `Decryption failed: ${error instanceof Error ? error.message : String(error)}`, 'high');
      throw new UserError(`Decryption failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create request signature for API authentication
   */
  createRequestSignature(method: string, url: string, body: string, secretKey: string): RequestSignature {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomBytes(16).toString('hex');
    
    const message = `${method.toUpperCase()}|${url}|${body}|${timestamp}|${nonce}`;
    const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');

    this.auditLog('REQUEST_SIGNED', `Request signed for ${method} ${url}`, 'low');
    
    return {
      signature,
      timestamp,
      nonce,
    };
  }

  /**
   * Verify request signature
   */
  verifyRequestSignature(
    method: string,
    url: string,
    body: string,
    secretKey: string,
    signature: string,
    timestamp: string,
    nonce: string
  ): boolean {
    try {
      // Check timestamp validity (5 minutes tolerance)
      const now = Date.now();
      const requestTime = parseInt(timestamp);
      if (now - requestTime > 300000) { // 5 minutes
        this.auditLog('SIGNATURE_VERIFICATION_FAILED', 'Request timestamp expired', 'medium');
        return false;
      }

      const message = `${method.toUpperCase()}|${url}|${body}|${timestamp}|${nonce}`;
      const expectedSignature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');
      
      // Ensure both signatures are the same length for timingSafeEqual
      const signatureBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');
      
      if (signatureBuffer.length !== expectedBuffer.length) {
        this.auditLog('SIGNATURE_VERIFICATION_FAILED', 'Signature length mismatch', 'medium');
        return false;
      }
      
      const isValid = crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

      if (isValid) {
        this.auditLog('SIGNATURE_VERIFIED', `Request signature verified for ${method} ${url}`, 'low');
      } else {
        this.auditLog('SIGNATURE_VERIFICATION_FAILED', `Invalid signature for ${method} ${url}`, 'high');
      }

      return isValid;
    } catch (error) {
      this.auditLog('SIGNATURE_VERIFICATION_ERROR', `Signature verification error: ${error instanceof Error ? error.message : String(error)}`, 'high');
      return false;
    }
  }

  /**
   * Rate limiting with exponential backoff
   */
  checkRateLimit(identifier: string): { allowed: boolean; retryAfter?: number } {
    const attempts = this.failedAttempts.get(identifier);
    const now = new Date();

    if (!attempts) {
      return { allowed: true };
    }

    // Check if lockout period has expired
    const timeSinceLastAttempt = now.getTime() - attempts.lastAttempt.getTime();
    if (timeSinceLastAttempt > this.config.lockoutDuration!) {
      this.failedAttempts.delete(identifier);
      return { allowed: true };
    }

    // Check if max retries exceeded
    if (attempts.count >= this.config.maxRetries!) {
      const retryAfter = Math.ceil((this.config.lockoutDuration! - timeSinceLastAttempt) / 1000);
      this.auditLog('RATE_LIMIT_EXCEEDED', `Rate limit exceeded for ${identifier}`, 'medium');
      return { allowed: false, retryAfter };
    }

    return { allowed: true };
  }

  /**
   * Record failed attempt
   */
  recordFailedAttempt(identifier: string): void {
    const attempts = this.failedAttempts.get(identifier) || { count: 0, lastAttempt: new Date() };
    attempts.count++;
    attempts.lastAttempt = new Date();
    this.failedAttempts.set(identifier, attempts);
    
    this.auditLog('FAILED_ATTEMPT', `Failed attempt recorded for ${identifier} (count: ${attempts.count})`, 'medium');
  }

  /**
   * Clear failed attempts for identifier
   */
  clearFailedAttempts(identifier: string): void {
    this.failedAttempts.delete(identifier);
    this.auditLog('ATTEMPTS_CLEARED', `Failed attempts cleared for ${identifier}`, 'low');
  }

  /**
   * Hash password using bcrypt-like algorithm
   */
  hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, this.config.saltRounds! * 1000, 64, 'sha512');
    return `${salt}:${hash.toString('hex')}`;
  }

  /**
   * Verify password against hash
   */
  verifyPassword(password: string, hash: string): boolean {
    try {
      const [salt, storedHash] = hash.split(':');
      const hashToVerify = crypto.pbkdf2Sync(password, salt, this.config.saltRounds! * 1000, 64, 'sha512');
      return crypto.timingSafeEqual(Buffer.from(storedHash, 'hex'), hashToVerify);
    } catch (error) {
      this.auditLog('PASSWORD_VERIFICATION_ERROR', `Password verification error: ${error instanceof Error ? error.message : String(error)}`, 'high');
      return false;
    }
  }

  /**
   * Generate secure random token
   */
  generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Validate input to prevent injection attacks
   */
  validateInput(input: string, type: 'email' | 'password' | 'text' | 'alphanumeric' = 'text'): boolean {
    if (!input || typeof input !== 'string') {
      return false;
    }

    // Length limits
    if (input.length > 1000) {
      return false;
    }

    // Type-specific validation
    switch (type) {
    case 'email':
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      return emailRegex.test(input) && input.length <= 254;
      
    case 'password':
      // Allow most characters but check for null bytes and control characters
      return !/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(input) && input.length >= 8;
      
    case 'alphanumeric':
      return /^[a-zA-Z0-9_-]+$/.test(input);
      
    case 'text':
      // Basic XSS prevention - no script tags or javascript: protocol
      return !/<script|javascript:|on\w+=/i.test(input);
      
    default:
      return true;
    }
  }

  /**
   * Sanitize input to prevent XSS
   */
  sanitizeInput(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  /**
   * Add security audit log entry
   */
  auditLog(event: string, details: string, severity: 'low' | 'medium' | 'high' | 'critical'): void {
    const logEntry: SecurityAuditLog = {
      timestamp: new Date().toISOString(),
      event,
      details,
      severity,
    };

    this.auditLogs.push(logEntry);

    // Keep only last 1000 entries
    if (this.auditLogs.length > 1000) {
      this.auditLogs.shift();
    }

    // Log critical and high severity events to console
    if (severity === 'critical' || severity === 'high') {
      console.warn(`[SECURITY ${severity.toUpperCase()}] ${event}: ${details}`);
    }
  }

  /**
   * Get security audit logs
   */
  getAuditLogs(severity?: 'low' | 'medium' | 'high' | 'critical'): SecurityAuditLog[] {
    if (severity) {
      return this.auditLogs.filter(log => log.severity === severity);
    }
    return [...this.auditLogs];
  }

  /**
   * Generate security headers for HTTP responses
   */
  getSecurityHeaders(): Record<string, string> {
    return {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Content-Security-Policy': 'default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data:; font-src \'self\'; connect-src \'self\'; frame-ancestors \'none\'',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    };
  }

  /**
   * Check for common security vulnerabilities
   */
  performSecurityCheck(): {
    vulnerabilities: string[];
    recommendations: string[];
    score: number;
    } {
    const vulnerabilities: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // Check encryption key
    if (!this.config.encryptionKey || this.config.encryptionKey.length < 32) {
      vulnerabilities.push('Weak or missing encryption key');
      recommendations.push('Use a strong 32+ character encryption key');
      score -= 20;
    }

    // Check environment variables
    if (!process.env.ANYLIST_ENCRYPTION_KEY) {
      vulnerabilities.push('Encryption key not set in environment variables');
      recommendations.push('Set ANYLIST_ENCRYPTION_KEY environment variable');
      score -= 10;
    }

    // Check rate limiting configuration
    if (this.config.maxRetries! > 5) {
      vulnerabilities.push('Rate limiting too permissive');
      recommendations.push('Reduce max retries to 3-5 attempts');
      score -= 5;
    }

    // Check audit log retention
    if (this.auditLogs.length === 0) {
      vulnerabilities.push('No security audit logs found');
      recommendations.push('Enable security audit logging');
      score -= 5;
    }

    return {
      vulnerabilities,
      recommendations,
      score: Math.max(0, score),
    };
  }

  /**
   * Clear sensitive data from memory
   */
  clearSensitiveData(): void {
    // Clear failed attempts
    this.failedAttempts.clear();
    
    // Clear audit logs
    this.auditLogs.length = 0;
    
    this.auditLog('SENSITIVE_DATA_CLEARED', 'Sensitive data cleared from memory', 'low');
  }
}

/**
 * Singleton instance for easy access
 */
export const securityManager = SecurityManager.getInstance();