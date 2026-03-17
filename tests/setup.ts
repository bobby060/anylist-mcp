import { beforeAll, afterAll, vi } from 'vitest';

/**
 * Global test setup
 */

// Mock environment variables for testing
beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error'; // Suppress logs during testing
  
  // Mock console methods to avoid noise in test output
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  
  // Only allow console.error in tests for important debugging
  const originalError = console.error;
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    if (process.env.DEBUG_TESTS === 'true') {
      originalError(...args);
    }
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});