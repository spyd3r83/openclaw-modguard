import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Tokenizer, SessionId, Token } from '../src/tokenizer.js';
import { Vault } from '../src/vault.js';
import { PatternType, PatternCategory } from '../src/types.js';
import { TokenizationError, DetokenizationError, InvalidTokenError } from '../src/errors.js';

describe('Tokenizer', () => {
  let vault: Vault;
  let tokenizer: Tokenizer;
  let session: SessionId;

  beforeEach(async () => {
    vault = new Vault(':memory:', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
    await vault.ensureReady(); // Warm up key derivation before tests
    tokenizer = new Tokenizer(vault);
    session = tokenizer.generateSessionId();
  });

  afterEach(() => {
    vault.close();
    tokenizer.clearAllSessions();
  });

  describe('tokenize', () => {
    it('should generate token for email', async () => {
      const token = await tokenizer.tokenize('user@example.com', PatternType.EMAIL, session);
      
      expect(token).toMatch(/^EMAIL_[0-9a-f]{8}$/i);
    });

    it('should generate token for phone', async () => {
      const token = await tokenizer.tokenize('+1 555-123-4567', PatternType.PHONE, session);
      
      expect(token).toMatch(/^PHONE_[0-9a-f]{8}$/i);
    });

    it('should generate token for SSN', async () => {
      const token = await tokenizer.tokenize('123-45-6789', PatternType.SSN, session);
      
      expect(token).toMatch(/^SSN_[0-9a-f]{8}$/i);
    });

    it('should generate token for credit card', async () => {
      const token = await tokenizer.tokenize('4111 1111 1111 1111', PatternType.CREDIT_CARD, session);
      
      expect(token).toMatch(/^CREDIT_CARD_[0-9a-f]{8}$/i);
    });

    it('should generate token for API key', async () => {
      const token = await tokenizer.tokenize('sk-proj-abc123', PatternType.API_KEY, session);
      
      expect(token).toMatch(/^API_KEY_[0-9a-f]{8}$/i);
    });

    it('should generate token for bearer token', async () => {
      const token = await tokenizer.tokenize('Bearer abc123', PatternType.BEARER_TOKEN, session);
      
      expect(token).toMatch(/^BEARER_TOKEN_[0-9a-f]{8}$/i);
    });

    it('should generate token for PEM block', async () => {
      const token = await tokenizer.tokenize('-----BEGIN RSA PRIVATE KEY-----', PatternType.PEM_BLOCK, session);
      
      expect(token).toMatch(/^PEM_BLOCK_[0-9a-f]{8}$/i);
    });

    it('should generate token for IPv4', async () => {
      const token = await tokenizer.tokenize('192.168.1.1', PatternType.IPV4, session);
      
      expect(token).toMatch(/^IPV4_[0-9a-f]{8}$/i);
    });

    it('should generate token for IPv6', async () => {
      const token = await tokenizer.tokenize('fe80::1', PatternType.IPV6, session);
      
      expect(token).toMatch(/^IPV6_[0-9a-f]{8}$/i);
    });

    it('should be deterministic within same session', async () => {
      const token1 = await tokenizer.tokenize('user@example.com', PatternType.EMAIL, session);
      const token2 = await tokenizer.tokenize('user@example.com', PatternType.EMAIL, session);
      
      expect(token1).toBe(token2);
    });

    it('should handle Unicode characters', async () => {
      const token = await tokenizer.tokenize('François Müller', PatternType.PHONE, session);
      
      expect(token).toMatch(/^PHONE_[0-9a-f]{8}$/i);
    });

    it('should complete in acceptable time (<5ms)', async () => {
      const startTime = Date.now();
      await tokenizer.tokenize('user@example.com', PatternType.EMAIL, session);
      const elapsed = Date.now() - startTime;
      
      expect(elapsed).toBeLessThan(5);
    });

    it('should throw error for empty value', async () => {
      await expect(tokenizer.tokenize('', PatternType.EMAIL, session)).rejects.toThrow(TokenizationError);
    });

    it('should throw error for invalid session', async () => {
      await expect(tokenizer.tokenize('user@example.com', PatternType.EMAIL, 'invalid-session')).rejects.toThrow(TokenizationError);
    });
  });

  describe('session-scoped determinism', () => {
    it('should generate same token for same value in same session', async () => {
      const session1 = tokenizer.generateSessionId();
      const token1 = await tokenizer.tokenize('user@example.com', PatternType.EMAIL, session1);
      const token2 = await tokenizer.tokenize('user@example.com', PatternType.EMAIL, session1);
      
      expect(token1).toBe(token2);
    });

    it('should generate different tokens for same value across sessions', async () => {
      const session1 = tokenizer.generateSessionId();
      const session2 = tokenizer.generateSessionId();
      
      const token1 = await tokenizer.tokenize('user@example.com', PatternType.EMAIL, session1);
      const token2 = await tokenizer.tokenize('user@example.com', PatternType.EMAIL, session2);
      
      expect(token1).not.toBe(token2);
    });

    it('should generate different tokens for different values in same session', async () => {
      const session1 = tokenizer.generateSessionId();
      
      const token1 = await tokenizer.tokenize('user1@example.com', PatternType.EMAIL, session1);
      const token2 = await tokenizer.tokenize('user2@example.com', PatternType.EMAIL, session1);
      
      expect(token1).not.toBe(token2);
    });

    it('should generate unique session IDs', () => {
      const session1 = tokenizer.generateSessionId();
      const session2 = tokenizer.generateSessionId();
      const session3 = tokenizer.generateSessionId();
      
      expect(session1).not.toBe(session2);
      expect(session1).not.toBe(session3);
      expect(session2).not.toBe(session3);
    });
  });

  describe('detokenize', () => {
    it('should retrieve original value for token', async () => {
      const original = 'user@example.com';
      const token = await tokenizer.tokenize(original, PatternType.EMAIL, session);
      const retrieved = await tokenizer.detokenize(token, session);
      
      expect(retrieved).toBe(original);
    });

    it('should handle round-trip for phone', async () => {
      const original = '+1 555-123-4567';
      const token = await tokenizer.tokenize(original, PatternType.PHONE, session);
      const retrieved = await tokenizer.detokenize(token, session);
      
      expect(retrieved).toBe(original);
    });

    it('should handle round-trip for SSN', async () => {
      const original = '123-45-6789';
      const token = await tokenizer.tokenize(original, PatternType.SSN, session);
      const retrieved = await tokenizer.detokenize(token, session);
      
      expect(retrieved).toBe(original);
    });

    it('should handle round-trip for Unicode', async () => {
      const original = 'François Müller 您好 مرحبا';
      const token = await tokenizer.tokenize(original, PatternType.PHONE, session);
      const retrieved = await tokenizer.detokenize(token, session);
      
      expect(retrieved).toBe(original);
    });

    it('should complete in acceptable time (<5ms)', async () => {
      const token = await tokenizer.tokenize('user@example.com', PatternType.EMAIL, session);
      const startTime = Date.now();
      await tokenizer.detokenize(token, session);
      const elapsed = Date.now() - startTime;
      
      expect(elapsed).toBeLessThan(5);
    });

    it('should throw error for invalid token format', async () => {
      await expect(tokenizer.detokenize('INVALID_TOKEN' as Token, session)).rejects.toThrow(DetokenizationError);
    });

    it('should throw error for token not in vault', async () => {
      const token = 'EMAIL_ffffffff' as Token;
      await expect(tokenizer.detokenize(token, session)).rejects.toThrow(DetokenizationError);
    });

    it('should throw error for invalid session', async () => {
      const token = await tokenizer.tokenize('user@example.com', PatternType.EMAIL, session);
      await expect(tokenizer.detokenize(token, 'invalid-session')).rejects.toThrow(DetokenizationError);
    });
  });

  describe('tokenizeBatch', () => {
    it('should tokenize multiple values', async () => {
      const values = ['user1@example.com', 'user2@example.com', 'user3@example.com'];
      const tokens = await tokenizer.tokenizeBatch(values, PatternType.EMAIL, session);
      
      expect(tokens).toHaveLength(3);
      tokens.forEach((token) => {
        expect(token).toMatch(/^EMAIL_[0-9a-f]{8}$/i);
      });
    });

    it('should preserve input order', async () => {
      const values = ['value1', 'value2', 'value3'];
      const tokens = await tokenizer.tokenizeBatch(values, PatternType.PHONE, session);
      
      const token1 = await tokenizer.tokenize('value1', PatternType.PHONE, session);
      const token2 = await tokenizer.tokenize('value2', PatternType.PHONE, session);
      const token3 = await tokenizer.tokenize('value3', PatternType.PHONE, session);
      
      expect(tokens[0]).toBe(token1);
      expect(tokens[1]).toBe(token2);
      expect(tokens[2]).toBe(token3);
    });

    it('should handle empty array', async () => {
      const tokens = await tokenizer.tokenizeBatch([], PatternType.EMAIL, session);
      
      expect(tokens).toHaveLength(0);
    });

    it('should maintain determinism in batch', async () => {
      const values = ['user@example.com', 'user@example.com'];
      const tokens = await tokenizer.tokenizeBatch(values, PatternType.EMAIL, session);
      
      expect(tokens[0]).toBe(tokens[1]);
    });

    it('should scale linearly with input size', async () => {
      const values = Array.from({ length: 100 }, (_, i) => `user${i}@example.com`);
      const startTime = Date.now();
      await tokenizer.tokenizeBatch(values, PatternType.EMAIL, session);
      const elapsed = Date.now() - startTime;
      
      expect(elapsed).toBeLessThan(500);
    });
  });

  describe('isValidToken', () => {
    it('should return true for valid email token', () => {
      expect(tokenizer.isValidToken('EMAIL_7f3a2c1b')).toBe(true);
    });

    it('should return true for valid phone token', () => {
      expect(tokenizer.isValidToken('PHONE_a1b2c3d4')).toBe(true);
    });

    it('should return true for valid SSN token', () => {
      expect(tokenizer.isValidToken('SSN_12345678')).toBe(true);
    });

    it('should return true for valid credit card token', () => {
      expect(tokenizer.isValidToken('CREDIT_CARD_abcdef12')).toBe(true);
    });

    it('should return true for valid API key token', () => {
      expect(tokenizer.isValidToken('API_KEY_1234abcd')).toBe(true);
    });

    it('should return true for valid bearer token token', () => {
      expect(tokenizer.isValidToken('BEARER_TOKEN_abcd1234')).toBe(true);
    });

    it('should return true for valid PEM block token', () => {
      expect(tokenizer.isValidToken('PEM_BLOCK_12ab34cd')).toBe(true);
    });

    it('should return true for valid IPv4 token', () => {
      expect(tokenizer.isValidToken('IPV4_aabbccdd')).toBe(true);
    });

    it('should return true for valid IPv6 token', () => {
      expect(tokenizer.isValidToken('IPV6_12345678')).toBe(true);
    });

    it('should return false for invalid token format', () => {
      expect(tokenizer.isValidToken('INVALID')).toBe(false);
      expect(tokenizer.isValidToken('EMAIL_ghijklmn')).toBe(false);
      expect(tokenizer.isValidToken('INVALID_12345678')).toBe(false);
    });

    it('should return false for invalid hex characters', () => {
      expect(tokenizer.isValidToken('EMAIL_ghijklmn')).toBe(false);
    });

    it('should return false for non-string input', () => {
      expect(tokenizer.isValidToken(123 as unknown)).toBe(false);
      expect(tokenizer.isValidToken(null)).toBe(false);
      expect(tokenizer.isValidToken(undefined)).toBe(false);
    });

    it('should complete in acceptable time (<1ms)', () => {
      const startTime = Date.now();
      tokenizer.isValidToken('EMAIL_7f3a2c1b');
      const elapsed = Date.now() - startTime;
      
      expect(elapsed).toBeLessThan(1);
    });
  });

  describe('session management', () => {
    it('should clear session', async () => {
      const session1 = tokenizer.generateSessionId();
      const token1 = await tokenizer.tokenize('user@example.com', PatternType.EMAIL, session1);
      
      tokenizer.clearSession(session1);
      
      await expect(tokenizer.tokenize('user@example.com', PatternType.EMAIL, session1)).rejects.toThrow(TokenizationError);
    });

    it('should clear all sessions', async () => {
      const session1 = tokenizer.generateSessionId();
      const session2 = tokenizer.generateSessionId();
      
      await tokenizer.tokenize('user1@example.com', PatternType.EMAIL, session1);
      await tokenizer.tokenize('user2@example.com', PatternType.EMAIL, session2);
      
      tokenizer.clearAllSessions();
      
      await expect(tokenizer.tokenize('user1@example.com', PatternType.EMAIL, session1)).rejects.toThrow(TokenizationError);
      await expect(tokenizer.tokenize('user2@example.com', PatternType.EMAIL, session2)).rejects.toThrow(TokenizationError);
    });
  });

  describe('error handling', () => {
    it('should include context in TokenizationError', async () => {
      try {
        await tokenizer.tokenize('', PatternType.EMAIL, session);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TokenizationError);
        expect((error as TokenizationError).context).toEqual({ session, category: PatternType.EMAIL });
      }
    });

    it('should include context in DetokenizationError', async () => {
      try {
        await tokenizer.detokenize('INVALID_TOKEN' as Token, session);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DetokenizationError);
        expect((error as DetokenizationError).context).toHaveProperty('token');
        expect((error as DetokenizationError).context).toHaveProperty('session');
      }
    });

    it('should not expose original values in error messages', async () => {
      const original = 'sensitive-data@example.com';
      const token = await tokenizer.tokenize(original, PatternType.EMAIL, session);
      
      try {
        await tokenizer.detokenize(token, 'invalid-session');
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as DetokenizationError).message).not.toContain(original);
        expect((error as DetokenizationError).message).not.toContain('sensitive');
      }
    });
  });

  describe('edge cases', () => {
    it('should handle very long values', async () => {
      const longValue = 'a'.repeat(10000);
      const token = await tokenizer.tokenize(longValue, PatternType.EMAIL, session);
      const retrieved = await tokenizer.detokenize(token, session);
      
      expect(retrieved).toBe(longValue);
    });

    it('should handle special characters', async () => {
      const specialValue = 'test+special@example.com';
      const token = await tokenizer.tokenize(specialValue, PatternType.EMAIL, session);
      const retrieved = await tokenizer.detokenize(token, session);
      
      expect(retrieved).toBe(specialValue);
    });

    it('should handle emojis', async () => {
      const emojiValue = 'user😀@example.com';
      const token = await tokenizer.tokenize(emojiValue, PatternType.EMAIL, session);
      const retrieved = await tokenizer.detokenize(token, session);
      
      expect(retrieved).toBe(emojiValue);
    });

    it('should handle newlines', async () => {
      const newlineValue = 'line1\nline2\nline3';
      const token = await tokenizer.tokenize(newlineValue, PatternType.PHONE, session);
      const retrieved = await tokenizer.detokenize(token, session);
      
      expect(retrieved).toBe(newlineValue);
    });
  });

  describe('performance benchmarks', () => {
    it('should meet tokenize performance target (<1ms for single)', async () => {
      const iterations = 100;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        await tokenizer.tokenize(`user${i}@example.com`, PatternType.EMAIL, session);
      }

      const elapsed = Date.now() - startTime;
      const average = elapsed / iterations;

      expect(average).toBeLessThan(1);
    });

    it('should meet detokenize performance target (<1ms for single)', async () => {
      const iterations = 100;
      const tokens: Token[] = [];

      for (let i = 0; i < iterations; i++) {
        tokens.push(await tokenizer.tokenize(`user${i}@example.com`, PatternType.EMAIL, session));
      }

      const startTime = Date.now();

      for (const token of tokens) {
        await tokenizer.detokenize(token, session);
      }

      const elapsed = Date.now() - startTime;
      const average = elapsed / iterations;

      expect(average).toBeLessThan(1);
    });

    it('should meet batch tokenization performance target (<5ms for 10 items)', async () => {
      const values = Array.from({ length: 10 }, (_, i) => `user${i}@example.com`);
      const startTime = Date.now();

      await tokenizer.tokenizeBatch(values, PatternType.EMAIL, session);

      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(20);
    });
  });

  describe('comprehensive PII fixtures', () => {
    describe('email fixtures', () => {
      const emailFixtures = [
        'user@example.com',
        'first.last@domain.co.uk',
        'user+tag@example.com',
        'user_name@example.com',
        'user123@test-domain.com',
        'name.surname@subdomain.example.org',
        'a@b.co',
        'very.long.email.address@very.long.domain.example.com'
      ];

      emailFixtures.forEach((email) => {
        it(`should tokenize and detokenize email: ${email}`, async () => {
          const token = await tokenizer.tokenize(email, PatternType.EMAIL, session);
          const retrieved = await tokenizer.detokenize(token, session);

          expect(retrieved).toBe(email);
          expect(token).toMatch(/^EMAIL_[0-9a-f]{8}$/i);
        });
      });
    });

    describe('phone fixtures', () => {
      const phoneFixtures = [
        '+1 555-123-4567',
        '+44 20 7946 0958',
        '+86 138 0013 8000',
        '+81 90 1234 5678',
        '+33 1 23 45 67 89',
        '555-123-4567',
        '(555) 123-4567',
        '1-555-123-4567',
        '001 555 123 4567',
        '1234567890'
      ];

      phoneFixtures.forEach((phone) => {
        it(`should tokenize and detokenize phone: ${phone}`, async () => {
          const token = await tokenizer.tokenize(phone, PatternType.PHONE, session);
          const retrieved = await tokenizer.detokenize(token, session);

          expect(retrieved).toBe(phone);
          expect(token).toMatch(/^PHONE_[0-9a-f]{8}$/i);
        });
      });
    });

    describe('SSN fixtures', () => {
      const ssnFixtures = [
        '123-45-6789',
        '987-65-4321',
        '000-00-0001',
        '999-99-9999',
        '111-22-3333'
      ];

      ssnFixtures.forEach((ssn) => {
        it(`should tokenize and detokenize SSN: ${ssn}`, async () => {
          const token = await tokenizer.tokenize(ssn, PatternType.SSN, session);
          const retrieved = await tokenizer.detokenize(token, session);

          expect(retrieved).toBe(ssn);
          expect(token).toMatch(/^SSN_[0-9a-f]{8}$/i);
        });
      });
    });

    describe('credit card fixtures', () => {
      const creditCardFixtures = [
        '4111 1111 1111 1111',
        '5500 0000 0000 0004',
        '3400 0000 0000 009',
        '6011 0000 0000 0004',
        '3530 1113 3300 0000',
        '4111111111111111',
        '5500000000000004',
        '378282246310005',
        '371449635398431',
        '6011111111111117'
      ];

      creditCardFixtures.forEach((card) => {
        it(`should tokenize and detokenize credit card: ${card}`, async () => {
          const token = await tokenizer.tokenize(card, PatternType.CREDIT_CARD, session);
          const retrieved = await tokenizer.detokenize(token, session);

          expect(retrieved).toBe(card);
          expect(token).toMatch(/^CREDIT_CARD_[0-9a-f]{8}$/i);
        });
      });
    });

    describe('API key fixtures', () => {
      const apiKeyFixtures = [
        'sk-proj-abc123def456',
        'sk_live_51Mx',
        'AIzaSyCb-abc123',
        'pk_live_123456',
        'AKIAIOSFODNN7EXAMPLE',
        'xoxb-1234567890-1234567890',
        'ghp_1234567890abcdefghij',
        'ya29.abcdef123456'
      ];

      apiKeyFixtures.forEach((apiKey) => {
        it(`should tokenize and detokenize API key: ${apiKey}`, async () => {
          const token = await tokenizer.tokenize(apiKey, PatternType.API_KEY, session);
          const retrieved = await tokenizer.detokenize(token, session);

          expect(retrieved).toBe(apiKey);
          expect(token).toMatch(/^API_KEY_[0-9a-f]{8}$/i);
        });
      });
    });

    describe('bearer token fixtures', () => {
      const bearerTokenFixtures = [
        'Bearer abc123def456',
        'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        'Bearer sk-proj-123456',
        'Bearer a1b2c3d4e5f6'
      ];

      bearerTokenFixtures.forEach((bearer) => {
        it(`should tokenize and detokenize bearer token: ${bearer}`, async () => {
          const token = await tokenizer.tokenize(bearer, PatternType.BEARER_TOKEN, session);
          const retrieved = await tokenizer.detokenize(token, session);

          expect(retrieved).toBe(bearer);
          expect(token).toMatch(/^BEARER_TOKEN_[0-9a-f]{8}$/i);
        });
      });
    });

    describe('PEM block fixtures', () => {
      const pemFixtures = [
        '-----BEGIN RSA PRIVATE KEY-----',
        '-----BEGIN EC PRIVATE KEY-----',
        '-----BEGIN PUBLIC KEY-----',
        '-----BEGIN CERTIFICATE-----',
        '-----BEGIN OPENSSH PRIVATE KEY-----',
        '-----BEGIN PRIVATE KEY-----'
      ];

      pemFixtures.forEach((pem) => {
        it(`should tokenize and detokenize PEM block: ${pem}`, async () => {
          const token = await tokenizer.tokenize(pem, PatternType.PEM_BLOCK, session);
          const retrieved = await tokenizer.detokenize(token, session);

          expect(retrieved).toBe(pem);
          expect(token).toMatch(/^PEM_BLOCK_[0-9a-f]{8}$/i);
        });
      });
    });

    describe('IPv4 fixtures', () => {
      const ipv4Fixtures = [
        '192.168.1.1',
        '10.0.0.1',
        '172.16.0.1',
        '8.8.8.8',
        '1.1.1.1',
        '127.0.0.1',
        '255.255.255.255',
        '0.0.0.0',
        '224.0.0.1'
      ];

      ipv4Fixtures.forEach((ip) => {
        it(`should tokenize and detokenize IPv4: ${ip}`, async () => {
          const token = await tokenizer.tokenize(ip, PatternType.IPV4, session);
          const retrieved = await tokenizer.detokenize(token, session);

          expect(retrieved).toBe(ip);
          expect(token).toMatch(/^IPV4_[0-9a-f]{8}$/i);
        });
      });
    });

    describe('IPv6 fixtures', () => {
      const ipv6Fixtures = [
        'fe80::1',
        '2001:db8::1',
        '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        '2001:db8:85a3::8a2e:370:7334',
        '::1',
        '::',
        '2001:db8::8a2e:370:7334',
        'fc00::1',
        'ff02::1'
      ];

      ipv6Fixtures.forEach((ip) => {
        it(`should tokenize and detokenize IPv6: ${ip}`, async () => {
          const token = await tokenizer.tokenize(ip, PatternType.IPV6, session);
          const retrieved = await tokenizer.detokenize(token, session);

          expect(retrieved).toBe(ip);
          expect(token).toMatch(/^IPV6_[0-9a-f]{8}$/i);
        });
      });
    });
  });

  describe('additional edge cases', () => {
    it('should handle empty string in tokenize', async () => {
      await expect(tokenizer.tokenize('', PatternType.EMAIL, session)).rejects.toThrow(TokenizationError);
    });

    it('should handle null value type in isValidToken', () => {
      expect(tokenizer.isValidToken(null)).toBe(false);
    });

    it('should handle undefined value type in isValidToken', () => {
      expect(tokenizer.isValidToken(undefined)).toBe(false);
    });

    it('should handle number in isValidToken', () => {
      expect(tokenizer.isValidToken(123456)).toBe(false);
    });

    it('should handle object in isValidToken', () => {
      expect(tokenizer.isValidToken({})).toBe(false);
    });

    it('should handle array in isValidToken', () => {
      expect(tokenizer.isValidToken([])).toBe(false);
    });

    it('should handle token with wrong case for prefix', () => {
      expect(tokenizer.isValidToken('email_12345678')).toBe(true);
    });

    it('should handle token with uppercase hex', () => {
      expect(tokenizer.isValidToken('EMAIL_ABCDEF12')).toBe(true);
    });

    it('should handle token with mixed case hex', () => {
      expect(tokenizer.isValidToken('EMAIL_aBcDeF12')).toBe(true);
    });

    it('should reject token with too short hex', () => {
      expect(tokenizer.isValidToken('EMAIL_123456')).toBe(false);
    });

    it('should reject token with too long hex', () => {
      expect(tokenizer.isValidToken('EMAIL_1234567890')).toBe(false);
    });

    it('should reject token without underscore', () => {
      expect(tokenizer.isValidToken('EMAIL12345678')).toBe(false);
    });

    it('should reject token with multiple underscores', () => {
      expect(tokenizer.isValidToken('EMAIL_1234_5678')).toBe(false);
    });

    it('should handle value with only spaces', async () => {
      const value = '     ';
      const token = await tokenizer.tokenize(value, PatternType.EMAIL, session);
      const retrieved = await tokenizer.detokenize(token, session);

      expect(retrieved).toBe(value);
    });

    it('should handle value with leading/trailing spaces', async () => {
      const value = '  user@example.com  ';
      const token = await tokenizer.tokenize(value, PatternType.EMAIL, session);
      const retrieved = await tokenizer.detokenize(token, session);

      expect(retrieved).toBe(value);
    });

    it('should handle value with tabs', async () => {
      const value = 'user\t@example.com';
      const token = await tokenizer.tokenize(value, PatternType.EMAIL, session);
      const retrieved = await tokenizer.detokenize(token, session);

      expect(retrieved).toBe(value);
    });

    it('should handle value with carriage return', async () => {
      const value = 'user\r@example.com';
      const token = await tokenizer.tokenize(value, PatternType.EMAIL, session);
      const retrieved = await tokenizer.detokenize(token, session);

      expect(retrieved).toBe(value);
    });

    it('should handle value with mixed Unicode', async () => {
      const value = 'François Müller 你好 مرحبا Привет';
      const token = await tokenizer.tokenize(value, PatternType.EMAIL, session);
      const retrieved = await tokenizer.detokenize(token, session);

      expect(retrieved).toBe(value);
    });

    it('should handle value with zero-width characters', async () => {
      const value = 'user\u200B@example.com';
      const token = await tokenizer.tokenize(value, PatternType.EMAIL, session);
      const retrieved = await tokenizer.detokenize(token, session);

      expect(retrieved).toBe(value);
    });

    it('should handle value with control characters', async () => {
      const value = 'user\x01@example.com';
      const token = await tokenizer.tokenize(value, PatternType.EMAIL, session);
      const retrieved = await tokenizer.detokenize(token, session);

      expect(retrieved).toBe(value);
    });

    it('should handle value with surrogate pairs', async () => {
      const value = 'user😀@example.com';
      const token = await tokenizer.tokenize(value, PatternType.EMAIL, session);
      const retrieved = await tokenizer.detokenize(token, session);

      expect(retrieved).toBe(value);
    });
  });

  describe('batch operations extended', () => {
    it('should handle batch of 1 value', async () => {
      const values = ['single@example.com'];
      const tokens = await tokenizer.tokenizeBatch(values, PatternType.EMAIL, session);

      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toMatch(/^EMAIL_[0-9a-f]{8}$/i);
    });

    it('should handle batch of 100 values', async () => {
      const values = Array.from({ length: 100 }, (_, i) => `user${i}@example.com`);
      const tokens = await tokenizer.tokenizeBatch(values, PatternType.EMAIL, session);

      expect(tokens).toHaveLength(100);
      tokens.forEach((token) => {
        expect(token).toMatch(/^EMAIL_[0-9a-f]{8}$/i);
      });
    });

    it('should handle batch of 1000 values', async () => {
      const values = Array.from({ length: 1000 }, (_, i) => `user${i}@example.com`);
      const tokens = await tokenizer.tokenizeBatch(values, PatternType.EMAIL, session);

      expect(tokens).toHaveLength(1000);
      tokens.forEach((token) => {
        expect(token).toMatch(/^EMAIL_[0-9a-f]{8}$/i);
      });
    });

    it('should handle batch with duplicate values', async () => {
      const values = ['user@example.com', 'user@example.com', 'user@example.com'];
      const tokens = await tokenizer.tokenizeBatch(values, PatternType.EMAIL, session);

      expect(tokens).toHaveLength(3);
      expect(tokens[0]).toBe(tokens[1]);
      expect(tokens[1]).toBe(tokens[2]);
    });

    it('should handle batch with different categories', async () => {
      const values = ['user@example.com', 'user2@example.com'];
      const tokens1 = await tokenizer.tokenizeBatch(values, PatternType.EMAIL, session);
      const tokens2 = await tokenizer.tokenizeBatch(values, PatternType.PHONE, session);

      expect(tokens1).toHaveLength(2);
      expect(tokens2).toHaveLength(2);
      expect(tokens1[0]).not.toBe(tokens2[0]);
    });

    it('should handle batch round-trip', async () => {
      const values = ['user1@example.com', 'user2@example.com', 'user3@example.com'];
      const tokens = await tokenizer.tokenizeBatch(values, PatternType.EMAIL, session);

      for (let i = 0; i < tokens.length; i++) {
        const retrieved = await tokenizer.detokenize(tokens[i], session);
        expect(retrieved).toBe(values[i]);
      }
    });
  });

  describe('vault integration', () => {
    it('should store token in vault', async () => {
      const value = 'user@example.com';
      const token = await tokenizer.tokenize(value, PatternType.EMAIL, session);

      const retrieved = await tokenizer.detokenize(token, session);

      expect(retrieved).toBe(value);
    });

    it('should retrieve same value from multiple lookups', async () => {
      const value = 'user@example.com';
      const token = await tokenizer.tokenize(value, PatternType.EMAIL, session);

      const retrieved1 = await tokenizer.detokenize(token, session);
      const retrieved2 = await tokenizer.detokenize(token, session);
      const retrieved3 = await tokenizer.detokenize(token, session);

      expect(retrieved1).toBe(value);
      expect(retrieved2).toBe(value);
      expect(retrieved3).toBe(value);
    });

    it('should handle vault connection gracefully', async () => {
      const testVault = new Vault(':memory:', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
      const testTokenizer = new Tokenizer(testVault);
      const testSession = testTokenizer.generateSessionId();

      const value = 'user@example.com';
      const token = await testTokenizer.tokenize(value, PatternType.EMAIL, testSession);
      const retrieved = await testTokenizer.detokenize(token, testSession);

      expect(retrieved).toBe(value);

      testVault.close();
      testTokenizer.clearAllSessions();
    });
  });

  describe('validation extended', () => {
    it('should validate token for EMAIL category', () => {
      expect(tokenizer.isValidToken('EMAIL_12345678')).toBe(true);
      expect(tokenizer.isValidToken('email_12345678')).toBe(true);
      expect(tokenizer.isValidToken('Email_12345678')).toBe(true);
    });

    it('should validate token for PHONE category', () => {
      expect(tokenizer.isValidToken('PHONE_12345678')).toBe(true);
      expect(tokenizer.isValidToken('phone_12345678')).toBe(true);
    });

    it('should validate token for SSN category', () => {
      expect(tokenizer.isValidToken('SSN_12345678')).toBe(true);
      expect(tokenizer.isValidToken('ssn_12345678')).toBe(true);
    });

    it('should validate token for CREDIT_CARD category', () => {
      expect(tokenizer.isValidToken('CREDIT_CARD_12345678')).toBe(true);
      expect(tokenizer.isValidToken('credit_card_12345678')).toBe(true);
    });

    it('should validate token for API_KEY category', () => {
      expect(tokenizer.isValidToken('API_KEY_12345678')).toBe(true);
      expect(tokenizer.isValidToken('api_key_12345678')).toBe(true);
    });

    it('should validate token for BEARER_TOKEN category', () => {
      expect(tokenizer.isValidToken('BEARER_TOKEN_12345678')).toBe(true);
      expect(tokenizer.isValidToken('bearer_token_12345678')).toBe(true);
    });

    it('should validate token for PEM_BLOCK category', () => {
      expect(tokenizer.isValidToken('PEM_BLOCK_12345678')).toBe(true);
      expect(tokenizer.isValidToken('pem_block_12345678')).toBe(true);
    });

    it('should validate token for IPV4 category', () => {
      expect(tokenizer.isValidToken('IPV4_12345678')).toBe(true);
      expect(tokenizer.isValidToken('ipv4_12345678')).toBe(true);
    });

    it('should validate token for IPV6 category', () => {
      expect(tokenizer.isValidToken('IPV6_12345678')).toBe(true);
      expect(tokenizer.isValidToken('ipv6_12345678')).toBe(true);
    });

    it('should reject invalid category prefixes', () => {
      expect(tokenizer.isValidToken('INVALID_12345678')).toBe(false);
      expect(tokenizer.isValidToken('UNKNOWN_12345678')).toBe(false);
      expect(tokenizer.isValidToken('TEST_12345678')).toBe(false);
    });
  });

  describe('performance benchmarks extended', () => {
    it('should handle 1000 tokenize operations in reasonable time', async () => {
      const iterations = 1000;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        await tokenizer.tokenize(`user${i}@example.com`, PatternType.EMAIL, session);
      }

      const elapsed = Date.now() - startTime;
      const average = elapsed / iterations;

      expect(average).toBeLessThan(5);
    });

    it('should handle 1000 detokenize operations in reasonable time', async () => {
      const iterations = 1000;
      const tokens: Token[] = [];

      for (let i = 0; i < iterations; i++) {
        tokens.push(await tokenizer.tokenize(`user${i}@example.com`, PatternType.EMAIL, session));
      }

      const startTime = Date.now();

      for (const token of tokens) {
        await tokenizer.detokenize(token, session);
      }

      const elapsed = Date.now() - startTime;
      const average = elapsed / iterations;

      expect(average).toBeLessThan(5);
    });

    it('should handle batch of 100 values in reasonable time', async () => {
      const values = Array.from({ length: 100 }, (_, i) => `user${i}@example.com`);
      const startTime = Date.now();

      await tokenizer.tokenizeBatch(values, PatternType.EMAIL, session);

      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(500);
    });

    it('should handle batch of 1000 values in reasonable time', async () => {
      const values = Array.from({ length: 1000 }, (_, i) => `user${i}@example.com`);
      const startTime = Date.now();

      await tokenizer.tokenizeBatch(values, PatternType.EMAIL, session);

      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(5000);
    });
  });
});
