import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  secureZero,
  secureZeroUint8Array,
  timingSafeEqual,
  timingSafeStringEqual,
  secureRandomBytes,
  secureRandomHex,
  withSecureBuffer,
  withTempSecureBuffer
} from '../src/security.js';

describe('Security Utilities', () => {
  describe('secureZero', () => {
    it('should zero a buffer', () => {
      const buffer = Buffer.from([1, 2, 3, 4, 5]);
      secureZero(buffer);
      expect(buffer.every(byte => byte === 0)).toBe(true);
    });

    it('should handle empty buffer', () => {
      const buffer = Buffer.alloc(0);
      secureZero(buffer);
      expect(buffer.length).toBe(0);
    });

    it('should handle large buffer', () => {
      const buffer = Buffer.alloc(10000, 0xff);
      secureZero(buffer);
      expect(buffer.every(byte => byte === 0)).toBe(true);
    });

    it('should handle non-buffer input gracefully', () => {
      // Should not throw
      expect(() => secureZero(null as any)).not.toThrow();
      expect(() => secureZero(undefined as any)).not.toThrow();
      expect(() => secureZero('string' as any)).not.toThrow();
      expect(() => secureZero(123 as any)).not.toThrow();
    });
  });

  describe('secureZeroUint8Array', () => {
    it('should zero a Uint8Array', () => {
      const array = new Uint8Array([1, 2, 3, 4, 5]);
      secureZeroUint8Array(array);
      expect(Array.from(array).every(byte => byte === 0)).toBe(true);
    });

    it('should handle empty Uint8Array', () => {
      const array = new Uint8Array(0);
      secureZeroUint8Array(array);
      expect(array.length).toBe(0);
    });
  });

  describe('timingSafeEqual', () => {
    it('should return true for equal buffers', () => {
      const a = Buffer.from('hello');
      const b = Buffer.from('hello');
      expect(timingSafeEqual(a, b)).toBe(true);
    });

    it('should return false for different buffers', () => {
      const a = Buffer.from('hello');
      const b = Buffer.from('world');
      expect(timingSafeEqual(a, b)).toBe(false);
    });

    it('should return false for buffers of different lengths', () => {
      const a = Buffer.from('hello');
      const b = Buffer.from('hi');
      expect(timingSafeEqual(a, b)).toBe(false);
    });

    it('should return false for non-buffer inputs', () => {
      expect(timingSafeEqual(null as any, Buffer.from('test'))).toBe(false);
      expect(timingSafeEqual(Buffer.from('test'), null as any)).toBe(false);
      expect(timingSafeEqual('string' as any, 'string' as any)).toBe(false);
    });

    it('should handle empty buffers', () => {
      const a = Buffer.alloc(0);
      const b = Buffer.alloc(0);
      expect(timingSafeEqual(a, b)).toBe(true);
    });

    it('should handle binary data', () => {
      const a = Buffer.from([0x00, 0x01, 0xff, 0xfe]);
      const b = Buffer.from([0x00, 0x01, 0xff, 0xfe]);
      expect(timingSafeEqual(a, b)).toBe(true);

      const c = Buffer.from([0x00, 0x01, 0xff, 0xfd]);
      expect(timingSafeEqual(a, c)).toBe(false);
    });
  });

  describe('timingSafeStringEqual', () => {
    it('should return true for equal strings', () => {
      expect(timingSafeStringEqual('hello', 'hello')).toBe(true);
    });

    it('should return false for different strings', () => {
      expect(timingSafeStringEqual('hello', 'world')).toBe(false);
    });

    it('should return false for strings of different lengths', () => {
      expect(timingSafeStringEqual('hello', 'hi')).toBe(false);
    });

    it('should handle empty strings', () => {
      expect(timingSafeStringEqual('', '')).toBe(true);
    });

    it('should handle unicode strings', () => {
      expect(timingSafeStringEqual('こんにちは', 'こんにちは')).toBe(true);
      expect(timingSafeStringEqual('hello', 'こんにちは')).toBe(false);
    });
  });

  describe('secureRandomBytes', () => {
    it('should generate bytes of specified length', () => {
      const bytes = secureRandomBytes(16);
      expect(bytes.length).toBe(16);
    });

    it('should generate different bytes each time', () => {
      const a = secureRandomBytes(16);
      const b = secureRandomBytes(16);
      expect(a.equals(b)).toBe(false);
    });

    it('should generate zero-length buffer', () => {
      const bytes = secureRandomBytes(0);
      expect(bytes.length).toBe(0);
    });
  });

  describe('secureRandomHex', () => {
    it('should generate hex string of correct length', () => {
      const hex = secureRandomHex(16);
      expect(hex.length).toBe(32); // 16 bytes = 32 hex chars
    });

    it('should only contain hex characters', () => {
      const hex = secureRandomHex(32);
      expect(/^[0-9a-f]+$/.test(hex)).toBe(true);
    });

    it('should generate different values each time', () => {
      const a = secureRandomHex(16);
      const b = secureRandomHex(16);
      expect(a).not.toBe(b);
    });
  });

  describe('withSecureBuffer', () => {
    it('should zero buffer after function completes', async () => {
      const buffer = Buffer.from([1, 2, 3, 4, 5]);
      const bufferCopy = Buffer.from(buffer);

      await withSecureBuffer(buffer, (buf) => {
        // Buffer should still have original values during execution
        expect(buf.equals(bufferCopy)).toBe(true);
        return 'result';
      });

      // Buffer should be zeroed after
      expect(buffer.every(byte => byte === 0)).toBe(true);
    });

    it('should zero buffer even if function throws', async () => {
      const buffer = Buffer.from([1, 2, 3, 4, 5]);

      await expect(
        withSecureBuffer(buffer, () => {
          throw new Error('test error');
        })
      ).rejects.toThrow('test error');

      // Buffer should still be zeroed
      expect(buffer.every(byte => byte === 0)).toBe(true);
    });

    it('should return function result', async () => {
      const buffer = Buffer.from([1, 2, 3]);
      const result = await withSecureBuffer(buffer, () => 'test result');
      expect(result).toBe('test result');
    });
  });

  describe('withTempSecureBuffer', () => {
    it('should create temporary buffer and zero it after', async () => {
      let capturedBuffer: Buffer | null = null;

      await withTempSecureBuffer(10, (buf) => {
        capturedBuffer = buf;
        buf.fill(0xff);
        return 'result';
      });

      // Buffer should be zeroed after
      expect(capturedBuffer!.every(byte => byte === 0)).toBe(true);
    });

    it('should create buffer of correct size', async () => {
      await withTempSecureBuffer(42, (buf) => {
        expect(buf.length).toBe(42);
      });
    });
  });

  describe('Timing Attack Resistance', () => {
    // Note: These tests verify behavior, not actual timing (which would be flaky)
    it('should not short-circuit on first byte difference', () => {
      const a = Buffer.from('aaaaaaaa');
      const b = Buffer.from('baaaaaaa');
      const result = timingSafeEqual(a, b);
      expect(result).toBe(false);
    });

    it('should not short-circuit on last byte difference', () => {
      const a = Buffer.from('aaaaaaaa');
      const b = Buffer.from('aaaaaaab');
      const result = timingSafeEqual(a, b);
      expect(result).toBe(false);
    });

    it('should perform dummy comparison for length mismatch', () => {
      // This test ensures we don't leak timing info about length differences
      const a = Buffer.from('short');
      const b = Buffer.from('much longer string');

      // Should still return false, but execution path should be similar
      const result = timingSafeEqual(a, b);
      expect(result).toBe(false);
    });
  });
});
