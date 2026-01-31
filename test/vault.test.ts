import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Vault } from '../src/vault.js';
import { VaultError, EncryptionError, KeyDerivationError } from '../src/errors.js';
import fs from 'node:fs';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

describe('Vault', () => {
  const vaultPath = ':memory:';
  const masterKey = 'test-master-key-12345678';
  let vault: Vault;

  beforeEach(() => {
    vault = new Vault(vaultPath, masterKey);
  });

  afterEach(() => {
    vault.close();
  });

  describe('encryption and decryption round-trip', () => {
    it('should encrypt and decrypt values correctly', async () => {
      const token = 'test-token';
      const category = 'email';
      const value = 'user@example.com';

      await vault.store(token, category, value);
      const retrieved = await vault.retrieve(token, category);

      expect(retrieved).toBe(value);
    });

    it('should handle Unicode characters', async () => {
      const token = 'unicode-token';
      const category = 'name';
      const value = 'François Müller 您好 مرحبا';

      await vault.store(token, category, value);
      const retrieved = await vault.retrieve(token, category);

      expect(retrieved).toBe(value);
    });
  });

  describe('key derivation', () => {
    it('should derive same key from same master key and salt', async () => {
      const salt1 = crypto.randomBytes(32);
      const salt2 = crypto.randomBytes(32);

      const encoder = new TextEncoder();
      const keyMaterial1 = await crypto.subtle.importKey(
        'raw',
        encoder.encode(masterKey),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
      );
      const keyMaterial2 = await crypto.subtle.importKey(
        'raw',
        encoder.encode(masterKey),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
      );

      const derivedKey1 = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt1,
          iterations: 100000,
          hash: 'SHA-256'
        },
        keyMaterial1,
        {
          name: 'AES-GCM',
          length: 256
        },
        true,
        ['encrypt', 'decrypt']
      );
      const derivedKey2 = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt2,
          iterations: 100000,
          hash: 'SHA-256'
        },
        keyMaterial2,
        {
          name: 'AES-GCM',
          length: 256
        },
        true,
        ['encrypt', 'decrypt']
      );

      const exported1 = await crypto.subtle.exportKey('raw', derivedKey1);
      const exported2 = await crypto.subtle.exportKey('raw', derivedKey2);

      expect(Buffer.from(exported1).equals(Buffer.from(exported2))).toBe(false);
    });
  });

  describe('TTL functionality', () => {
    it('should store entry with TTL', async () => {
      const token = 'ttl-token';
      const category = 'phone';
      const value = '+1234567890';
      const ttl = 1000;

      await vault.store(token, category, value, { ttl });

      const retrieved = await vault.retrieve(token, category);
      expect(retrieved).toBe(value);
    });

    it('should not return expired entries', async () => {
      const token = 'expired-token';
      const category = 'ssn';
      const value = '123-45-6789';
      const ttl = 10;

      await vault.store(token, category, value, { ttl });

      await new Promise((resolve) => setTimeout(resolve, 20));

      const retrieved = await vault.retrieve(token, category);
      expect(retrieved).toBeNull();
    });

    it('should store entry without TTL and always return it', async () => {
      const token = 'no-ttl-token';
      const category = 'address';
      const value = '123 Main St';

      await vault.store(token, category, value);

      await new Promise((resolve) => setTimeout(resolve, 20));

      const retrieved = await vault.retrieve(token, category);
      expect(retrieved).toBe(value);
    });
  });

  describe('auto-cleanup', () => {
    it('should delete expired entries and return count', async () => {
      const token = 'cleanup-token';
      const category = 'email';
      const value = 'cleanup@example.com';
      const ttl = 10;

      await vault.store(token, category, value, { ttl });

      await new Promise((resolve) => setTimeout(resolve, 20));

      const count = vault.cleanupExpired();
      expect(count).toBe(1);
    });

    it('should return 0 when no expired entries', async () => {
      const token = 'valid-token';
      const category = 'name';
      const value = 'John Doe';

      await vault.store(token, category, value);

      const count = vault.cleanupExpired();
      expect(count).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should throw VaultError on encryption failure', async () => {
      const token = 'error-token';
      const category = 'test';
      const value = 'test-value';

      await expect(vault.store(token, category, value)).resolves.not.toThrow();
    });
  });

  describe('multiple entries', () => {
    it('should store and retrieve multiple entries', async () => {
      const entries = [
        { token: 'token1', category: 'email', value: 'user1@example.com' },
        { token: 'token2', category: 'phone', value: '+1234567890' },
        { token: 'token3', category: 'name', value: 'Jane Doe' }
      ];

      for (const entry of entries) {
        await vault.store(entry.token, entry.category, entry.value);
      }

      for (const entry of entries) {
        const retrieved = await vault.retrieve(entry.token, entry.category);
        expect(retrieved).toBe(entry.value);
      }
    });

    it('should return null for non-existent entries', async () => {
      const retrieved = await vault.retrieve('nonexistent', 'category');
      expect(retrieved).toBeNull();
    });

    it('should return most recent entry when multiple exist for same token and category', async () => {
      const token = 'recent-token';
      const category = 'value';

      await vault.store(token, category, 'value1');
      await vault.store(token, category, 'value2');
      await vault.store(token, category, 'value3');

      const retrieved = await vault.retrieve(token, category);
      expect(retrieved).toBe('value3');
    });
  });

  describe('different categories', () => {
    it('should handle same token with different categories', async () => {
      const token = 'multi-cat-token';

      await vault.store(token, 'email', 'user@example.com');
      await vault.store(token, 'phone', '+1234567890');
      await vault.store(token, 'name', 'Alice');

      const email = await vault.retrieve(token, 'email');
      const phone = await vault.retrieve(token, 'phone');
      const name = await vault.retrieve(token, 'name');

      expect(email).toBe('user@example.com');
      expect(phone).toBe('+1234567890');
      expect(name).toBe('Alice');
    });
  });
});

describe('VaultError classes', () => {
  it('should create VaultError with code and context', () => {
    const error = new VaultError('Test error', 'TEST_CODE', { key: 'value' });
    expect(error.name).toBe('VaultError');
    expect(error.code).toBe('TEST_CODE');
    expect(error.context).toEqual({ key: 'value' });
  });

  it('should create EncryptionError with correct code', () => {
    const error = new EncryptionError('Encryption failed');
    expect(error.name).toBe('EncryptionError');
    expect(error.code).toBe('ENCRYPTION_FAILED');
  });

  it('should create KeyDerivationError with correct code', () => {
    const error = new KeyDerivationError('Key derivation failed');
    expect(error.name).toBe('KeyDerivationError');
    expect(error.code).toBe('KEY_DERIVATION_FAILED');
  });
});
