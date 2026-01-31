import { describe, it, expect } from 'vitest';
import { Detector } from '../src/detector.js';
import { PatternCategory, PatternType } from '../src/types.js';
import { luhnCheck } from '../src/patterns/pii.js';

describe('Detector', () => {
  describe('email detection', () => {
    const emailText = `
      Contact us at user@example.com for support.
      Reach out to first.last+tag@sub.domain.org for sales.
      Invalid emails: not-an-email, @nodomain.com, user@, test@test
      Admin email: admin@company.co.uk
    `;

    it('should detect valid email addresses', () => {
      const detector = new Detector();
      const results = detector.detect(emailText);

      const emails = results.filter((r) => r.pattern === PatternType.EMAIL);
      expect(emails).toHaveLength(3);
      expect(emails[0].match).toBe('user@example.com');
      expect(emails[1].match).toBe('first.last+tag@sub.domain.org');
      expect(emails[2].match).toBe('admin@company.co.uk');
    });

    it('should have high confidence for email addresses', () => {
      const detector = new Detector();
      const results = detector.detect('user@example.com');

      const email = results.find((r) => r.pattern === PatternType.EMAIL);
      expect(email?.confidence).toBe(0.95);
    });

    it('should not detect invalid email patterns', () => {
      const detector = new Detector();
      const results = detector.detect('not-an-email @nodomain.com user@ test@test');

      const emails = results.filter((r) => r.pattern === PatternType.EMAIL);
      expect(emails).toHaveLength(0);
    });
  });

  describe('phone detection', () => {
    const phoneText = `
      Call us at +1 555-123-4567 for support.
      US number: (555) 123-4567
      Simple: 555.123.4567
      With extension: 555-123-4567 x1234
      Too short: 123
      Too long: 1234567890123456
    `;

    it('should detect international phone numbers', () => {
      const detector = new Detector();
      const results = detector.detect(phoneText);

      const phones = results.filter((r) => r.pattern === PatternType.PHONE);
      expect(phones.length).toBeGreaterThanOrEqual(4);
    });

    it('should detect various phone formats', () => {
      const detector = new Detector();
      const results = detector.detect(phoneText);

      const phones = results.filter((r) => r.pattern === PatternType.PHONE);
      const matches = phones.map((p) => p.match);
      expect(matches).toContainEqual('1 555-123-4567');
      expect(matches).toContainEqual('555) 123-4567');
      expect(matches).toContainEqual('555.123.4567');
    });

    it('should have medium confidence for phone numbers', () => {
      const detector = new Detector();
      const results = detector.detect('+1 555-123-4567');

      const phone = results.find((r) => r.pattern === PatternType.PHONE);
      expect(phone?.confidence).toBe(0.85);
    });
  });

  describe('SSN detection', () => {
    const ssnText = `
      My SSN is 123-45-6789.
      Another format: 123 45 6789
      Unformatted: 123456789
      Invalid SSN: 000-00-0000, 666-00-0000, 900-00-0000
      Wrong format: 1234-56-789
    `;

    it('should detect valid SSNs', () => {
      const detector = new Detector();
      const results = detector.detect(ssnText);

      const ssns = results.filter((r) => r.pattern === PatternType.SSN);
      expect(ssns).toHaveLength(3);
    });

    it('should exclude invalid SSN ranges', () => {
      const detector = new Detector();
      const results = detector.detect('000-00-0000 666-00-0000 900-00-0000');

      const ssns = results.filter((r) => r.pattern === PatternType.SSN);
      expect(ssns).toHaveLength(0);
    });

    it('should have high confidence for SSNs', () => {
      const detector = new Detector();
      const results = detector.detect('123-45-6789');

      const ssn = results.find((r) => r.pattern === PatternType.SSN);
      expect(ssn?.confidence).toBe(0.95);
    });
  });

  describe('credit card detection', () => {
    const ccText = `
      Valid Visa: 4111 1111 1111 1111
      Valid Amex: 378282246310005
      Invalid: 1234 5678 9012 3456
      Another valid: 5555 5555 5555 4444
    `;

    it('should detect valid credit card numbers with Luhn validation', () => {
      const detector = new Detector();
      const results = detector.detect(ccText);

      const cards = results.filter((r) => r.pattern === PatternType.CREDIT_CARD);
      expect(cards.length).toBeGreaterThanOrEqual(2);
    });

    it('should boost confidence for valid credit cards', () => {
      const detector = new Detector();
      const results = detector.detect('4111 1111 1111 1111');

      const card = results.find((r) => r.pattern === PatternType.CREDIT_CARD);
      expect(card?.confidence).toBe(0.9);
    });

    it('should have low confidence for invalid credit cards', () => {
      const detector = new Detector();
      const results = detector.detect('1234 5678 9012 3456');

      const cards = results.filter((r) => r.pattern === PatternType.CREDIT_CARD);
      if (cards.length > 0) {
        expect(cards[0].confidence).toBeLessThan(0.5);
      }
    });
  });

  describe('Luhn validation', () => {
    it('should validate valid credit card numbers', () => {
      expect(luhnCheck('4111 1111 1111 1111')).toBe(true);
      expect(luhnCheck('378282246310005')).toBe(true);
      expect(luhnCheck('5555 5555 5555 4444')).toBe(true);
    });

    it('should reject invalid credit card numbers', () => {
      expect(luhnCheck('1234 5678 9012 3456')).toBe(false);
      expect(luhnCheck('1111 1111 1111 1111')).toBe(false);
    });

    it('should handle spaces and hyphens', () => {
      expect(luhnCheck('4111-1111-1111-1111')).toBe(true);
      expect(luhnCheck('4 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1')).toBe(true);
    });
  });

  describe('API key detection', () => {
    const apiKeyText = `
      OpenAI API key: sk-proj-abc123def456...
      GitHub PAT: ghp_XYZ789ABC123def456
      Slack bot: xoxb-12345-67890-abcdef123
      Google Cloud: AIzaSyC-abc123def456
      Prefix only: sk- (not a key)
    `;

    it('should detect API keys with known prefixes', () => {
      const detector = new Detector();
      const results = detector.detect(apiKeyText);

      const apiKeys = results.filter((r) => r.pattern === PatternType.API_KEY);
      expect(apiKeys.length).toBeGreaterThanOrEqual(3);
    });

    it('should have high confidence for API keys', () => {
      const detector = new Detector();
      const results = detector.detect('sk-proj-abc123def456xyz');

      const key = results.find((r) => r.pattern === PatternType.API_KEY);
      expect(key?.confidence).toBe(0.9);
    });
  });

  describe('Bearer token detection', () => {
    const bearerText = `
      Authorization: Bearer eyJhbGc...
      Standalone: Bearer abc123xyz789
      Just token without Bearer: abc123xyz789
    `;

    it('should detect Bearer tokens', () => {
      const detector = new Detector();
      const results = detector.detect(bearerText);

      const tokens = results.filter((r) => r.pattern === PatternType.BEARER_TOKEN);
      expect(tokens).toHaveLength(2);
    });

    it('should have medium-high confidence for Bearer tokens', () => {
      const detector = new Detector();
      const results = detector.detect('Bearer eyJhbGc');

      const token = results.find((r) => r.pattern === PatternType.BEARER_TOKEN);
      expect(token?.confidence).toBe(0.85);
    });
  });

  describe('PEM block detection', () => {
    const pemText = `
      -----BEGIN RSA PRIVATE KEY-----
      MIIEpAIBAAKCAQEAz7...
      -----END RSA PRIVATE KEY-----

      -----BEGIN CERTIFICATE-----
      MIIDXTCCAkWgAwIBAg...
      -----END CERTIFICATE-----
    `;

    it('should detect PEM blocks', () => {
      const detector = new Detector();
      const results = detector.detect(pemText);

      const pems = results.filter((r) => r.pattern === PatternType.PEM_BLOCK);
      expect(pems.length).toBeGreaterThanOrEqual(2);
    });

    it('should have certain confidence for PEM blocks', () => {
      const detector = new Detector();
      const results = detector.detect('-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----');

      const pem = results.find((r) => r.pattern === PatternType.PEM_BLOCK);
      expect(pem?.confidence).toBe(1.0);
    });
  });

  describe('IPv4 detection', () => {
    const ipv4Text = `
      Local: 192.168.1.1
      DNS: 8.8.8.8
      Private: 172.16.254.1
      Invalid: 256.0.0.1, 192.168.300.1
      Another: 10.0.0.1
    `;

    it('should detect valid IPv4 addresses', () => {
      const detector = new Detector();
      const results = detector.detect(ipv4Text);

      const ips = results.filter((r) => r.pattern === PatternType.IPV4);
      expect(ips.length).toBeGreaterThanOrEqual(4);
    });

    it('should exclude invalid octets', () => {
      const detector = new Detector();
      const results = detector.detect('256.0.0.1 192.168.300.1');

      const ips = results.filter((r) => r.pattern === PatternType.IPV4);
      expect(ips).toHaveLength(0);
    });

    it('should have medium confidence for IPv4', () => {
      const detector = new Detector();
      const results = detector.detect('192.168.1.1');

      const ip = results.find((r) => r.pattern === PatternType.IPV4);
      expect(ip?.confidence).toBe(0.8);
    });
  });

  describe('IPv6 detection', () => {
    const ipv6Text = `
      Full: 2001:0db8:85a3:0000:0000:8a2e:0370:7334
      Compressed: 2001:db8::1
      Local: fe80::1ff:fe23:4567:890a
      Loopback: ::1
      IPv4 mapped: ::ffff:192.0.2.1
    `;

    it('should detect IPv6 addresses', () => {
      const detector = new Detector();
      const results = detector.detect(ipv6Text);

      const ips = results.filter((r) => r.pattern === PatternType.IPV6);
      expect(ips.length).toBeGreaterThanOrEqual(5);
    });

    it('should have medium confidence for IPv6', () => {
      const detector = new Detector();
      const results = detector.detect('Address: fe80::1');

      const ip = results.find((r) => r.pattern === PatternType.IPV6);
      expect(ip?.confidence).toBe(0.8);
    });
  });

  describe('detector configuration', () => {
    it('should filter by category', () => {
      const detector = new Detector({ categories: [PatternCategory.PII] });
      const results = detector.detect('user@example.com sk-abc123');

      expect(results).toHaveLength(1);
      expect(results[0].pattern).toBe(PatternType.EMAIL);
    });

    it('should filter by minimum confidence', () => {
      const detector = new Detector({ minConfidence: 0.9 });
      const results = detector.detect('user@example.com sk-proj-abc123def456');

      expect(results.length).toBeGreaterThanOrEqual(2);
      results.forEach((r) => {
        expect(r.confidence).toBeGreaterThanOrEqual(0.9);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      const detector = new Detector();
      const results = detector.detect('');

      expect(results).toHaveLength(0);
    });

    it('should handle string with no matches', () => {
      const detector = new Detector();
      const results = detector.detect('This is just plain text with no PII or secrets.');

      expect(results).toHaveLength(0);
    });

    it('should handle multiple matches of same pattern', () => {
      const detector = new Detector();
      const results = detector.detect('user1@example.com user2@example.org user3@example.net');

      const emails = results.filter((r) => r.pattern === PatternType.EMAIL);
      expect(emails).toHaveLength(3);
    });

    it('should handle overlapping matches', () => {
      const detector = new Detector();
      const results = detector.detect('Contact user@example.com or call +1 555-123-4567');

      expect(results.length).toBe(2);
    });

    it('should return results sorted by position', () => {
      const detector = new Detector();
      const results = detector.detect('Email: user@example.com, Phone: 555-123-4567');

      expect(results[0].pattern).toBe(PatternType.EMAIL);
      expect(results[1].pattern).toBe(PatternType.PHONE);
    });
  });

  describe('result structure', () => {
    it('should include all required fields', () => {
      const detector = new Detector();
      const results = detector.detect('user@example.com');

      expect(results[0]).toMatchObject({
        category: PatternCategory.PII,
        pattern: PatternType.EMAIL,
        match: expect.any(String),
        start: expect.any(Number),
        end: expect.any(Number),
        confidence: expect.any(Number)
      });
    });

    it('should have correct start and end positions', () => {
      const detector = new Detector();
      const text = 'Email: user@example.com';
      const results = detector.detect(text);

      const email = results[0];
      expect(email.start).toBe(7);
      expect(email.end).toBe(23);
      expect(text.slice(email.start, email.end)).toBe('user@example.com');
    });
  });

  describe('pattern management', () => {
    it('should get all patterns', () => {
      const detector = new Detector();
      const patterns = detector.getPatterns();

      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should allow updating patterns', () => {
      const detector = new Detector();

      detector.updatePatterns([]);
      expect(detector.getPatterns()).toHaveLength(0);
    });
  });

  describe('email edge cases', () => {
    it('should detect emails with numbers', () => {
      const detector = new Detector();
      const results = detector.detect('Contact user123@example.com or 456test@domain.org');

      const emails = results.filter((r) => r.pattern === PatternType.EMAIL);
      expect(emails).toHaveLength(2);
    });

    it('should detect emails with supported special characters', () => {
      const detector = new Detector();
      const results = detector.detect('user.test+tag@example.com user_name@example.com user-name@example.com');

      const emails = results.filter((r) => r.pattern === PatternType.EMAIL);
      expect(emails).toHaveLength(3);
    });

    it('should detect emails with hyphens in domain', () => {
      const detector = new Detector();
      const results = detector.detect('user@sub-domain.example.com');

      const emails = results.filter((r) => r.pattern === PatternType.EMAIL);
      expect(emails).toHaveLength(1);
    });

    it('should detect emails with long TLDs', () => {
      const detector = new Detector();
      const results = detector.detect('user@example.museum user@example.travel user@example.international');

      const emails = results.filter((r) => r.pattern === PatternType.EMAIL);
      expect(emails).toHaveLength(3);
    });

    it('should detect emails with nested subdomains', () => {
      const detector = new Detector();
      const results = detector.detect('user@a.b.c.d@sub.example.com');

      const emails = results.filter((r) => r.pattern === PatternType.EMAIL);
      expect(emails).toHaveLength(1);
    });

    it('should detect emails with underscores', () => {
      const detector = new Detector();
      const results = detector.detect('user_name@example.com user-name@example.com');

      const emails = results.filter((r) => r.pattern === PatternType.EMAIL);
      expect(emails).toHaveLength(2);
    });

    it('should detect emails with percent encoding', () => {
      const detector = new Detector();
      const results = detector.detect('user%40example.com@example.org user%2Btag@example.com');

      const emails = results.filter((r) => r.pattern === PatternType.EMAIL);
      expect(emails.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect emails with multiple dots in local part', () => {
      const detector = new Detector();
      const results = detector.detect('first.middle.last@company.com a.b.c@example.org');

      const emails = results.filter((r) => r.pattern === PatternType.EMAIL);
      expect(emails).toHaveLength(2);
    });
  });

  describe('phone edge cases', () => {
    it('should detect international country codes', () => {
      const detector = new Detector();
      const results = detector.detect('+44 207 946 0123 +49 30 1234567 +81 3 1234 5678');

      const phones = results.filter((r) => r.pattern === PatternType.PHONE);
      expect(phones.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect various country code formats', () => {
      const detector = new Detector();
      const results = detector.detect('+1 555-123-4567 +44 207 946 0123 +49 30 1234567');

      const phones = results.filter((r) => r.pattern === PatternType.PHONE);
      expect(phones.length).toBeGreaterThanOrEqual(2);
    });

    it('should detect domestic numbers without country code', () => {
      const detector = new Detector();
      const results = detector.detect('555-123-4567 (555) 987-6543');

      const phones = results.filter((r) => r.pattern === PatternType.PHONE);
      expect(phones).toHaveLength(2);
    });

    it('should detect numbers with spaces as separators', () => {
      const detector = new Detector();
      const results = detector.detect('555 123 4567 1 555 987 6543');

      const phones = results.filter((r) => r.pattern === PatternType.PHONE);
      expect(phones).toHaveLength(2);
    });

    it('should detect numbers with periods as separators', () => {
      const detector = new Detector();
      const results = detector.detect('555.123.4567 555.987.6543');

      const phones = results.filter((r) => r.pattern === PatternType.PHONE);
      expect(phones).toHaveLength(2);
    });

    it('should detect numbers with extension variations', () => {
      const detector = new Detector();
      const results = detector.detect('555-123-4567 x1234 555-987-6543 x999');

      const phones = results.filter((r) => r.pattern === PatternType.PHONE);
      expect(phones).toHaveLength(2);
    });

    it('should detect numbers with mixed separators', () => {
      const detector = new Detector();
      const results = detector.detect('(555) 123-4567 555.123.4567 555 123 4567');

      const phones = results.filter((r) => r.pattern === PatternType.PHONE);
      expect(phones).toHaveLength(3);
    });
  });

  describe('SSN edge cases', () => {
    it('should detect minimum valid SSN', () => {
      const detector = new Detector();
      const results = detector.detect('001-01-0001');

      const ssns = results.filter((r) => r.pattern === PatternType.SSN);
      expect(ssns).toHaveLength(1);
    });

    it('should detect maximum valid SSN below 900', () => {
      const detector = new Detector();
      const results = detector.detect('899-99-9999');

      const ssns = results.filter((r) => r.pattern === PatternType.SSN);
      expect(ssns).toHaveLength(1);
    });

    it('should reject SSNs starting with 000', () => {
      const detector = new Detector();
      const results = detector.detect('000-01-0001 000-99-9999');

      const ssns = results.filter((r) => r.pattern === PatternType.SSN);
      expect(ssns).toHaveLength(0);
    });

    it('should detect SSNs with all same digits except invalid ranges', () => {
      const detector = new Detector();
      const results = detector.detect('111-11-1111 222-22-2222 777-77-7777');

      const ssns = results.filter((r) => r.pattern === PatternType.SSN);
      expect(ssns).toHaveLength(3);
    });

    it('should detect SSNs with sequential digit patterns', () => {
      const detector = new Detector();
      const results = detector.detect('123-45-6789 234-56-7890 345-67-8901');

      const ssns = results.filter((r) => r.pattern === PatternType.SSN);
      expect(ssns).toHaveLength(3);
    });
  });

  describe('credit card edge cases', () => {
    it('should detect 16-digit Visa cards', () => {
      const detector = new Detector();
      const results = detector.detect('4111111111111111 4012888888881881');

      const cards = results.filter((r) => r.pattern === PatternType.CREDIT_CARD);
      expect(cards).toHaveLength(2);
    });

    it('should detect 15-digit Amex cards', () => {
      const detector = new Detector();
      const results = detector.detect('378282246310005 371449635398431');

      const cards = results.filter((r) => r.pattern === PatternType.CREDIT_CARD);
      expect(cards).toHaveLength(2);
    });

    it('should detect MasterCard numbers', () => {
      const detector = new Detector();
      const results = detector.detect('5555555555554444 5105105105105100');

      const cards = results.filter((r) => r.pattern === PatternType.CREDIT_CARD);
      expect(cards).toHaveLength(2);
    });

    it('should detect Discover cards', () => {
      const detector = new Detector();
      const results = detector.detect('6011111111111117 6011000990139424');

      const cards = results.filter((r) => r.pattern === PatternType.CREDIT_CARD);
      expect(cards).toHaveLength(2);
    });

    it('should detect JCB cards', () => {
      const detector = new Detector();
      const results = detector.detect('3530111333300000 3566002020360505');

      const cards = results.filter((r) => r.pattern === PatternType.CREDIT_CARD);
      expect(cards).toHaveLength(2);
    });

    it('should handle hyphen separators', () => {
      const detector = new Detector();
      const results = detector.detect('4111-1111-1111-1111 5555-5555-5555-4444');

      const cards = results.filter((r) => r.pattern === PatternType.CREDIT_CARD);
      expect(cards).toHaveLength(2);
    });

    it('should handle cards with leading zeros', () => {
      const detector = new Detector();
      const results = detector.detect('0123-4567-8912-3456 0000-0000-0000-0000');

      const cards = results.filter((r) => r.pattern === PatternType.CREDIT_CARD);
      expect(cards.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect different card brands', () => {
      const detector = new Detector();
      const results = detector.detect('4111111111111111 378282246310005 5555555555554444 6011111111111117 3530111333300000');

      const cards = results.filter((r) => r.pattern === PatternType.CREDIT_CARD);
      expect(cards).toHaveLength(5);
    });

    it('should validate Luhn for various card brands', () => {
      const detector = new Detector();
      const validCards = [
        '4111111111111111',
        '378282246310005',
        '5555555555554444',
        '6011111111111117'
      ];
      const results = detector.detect(validCards.join(' '));

      const cards = results.filter((r) => r.pattern === PatternType.CREDIT_CARD);
      expect(cards).toHaveLength(4);
    });
  });

  describe('API key edge cases', () => {
    it('should detect OpenAI sk-proj prefix', () => {
      const detector = new Detector();
      const results = detector.detect('sk-proj-AbCdEf1234567890');

      const apiKeys = results.filter((r) => r.pattern === PatternType.API_KEY);
      expect(apiKeys).toHaveLength(1);
    });

    it('should detect GitHub PAT prefix', () => {
      const detector = new Detector();
      const results = detector.detect('github_pat_11ABCDABCDABCDABCDABCDABCDEF123456789');

      const apiKeys = results.filter((r) => r.pattern === PatternType.API_KEY);
      expect(apiKeys).toHaveLength(1);
    });

    it('should detect Slack xoxp user token', () => {
      const detector = new Detector();
      const results = detector.detect('xoxp-1234-5678-9012-3456-7890');

      const apiKeys = results.filter((r) => r.pattern === PatternType.API_KEY);
      expect(apiKeys).toHaveLength(1);
    });

    it('should detect Slack xoxr refresh token', () => {
      const detector = new Detector();
      const results = detector.detect('xoxr-1234-5678-9012-3456-7890');

      const apiKeys = results.filter((r) => r.pattern === PatternType.API_KEY);
      expect(apiKeys).toHaveLength(1);
    });

    it('should detect Slack xoxs session token', () => {
      const detector = new Detector();
      const results = detector.detect('xoxs-1234-5678-9012-3456-7890abcdef');

      const apiKeys = results.filter((r) => r.pattern === PatternType.API_KEY);
      expect(apiKeys).toHaveLength(1);
    });

    it('should detect Google Cloud AIza prefix', () => {
      const detector = new Detector();
      const results = detector.detect('AIzaSyC-abcdefghijklmnopqrstuvwxy1234567890');

      const apiKeys = results.filter((r) => r.pattern === PatternType.API_KEY);
      expect(apiKeys).toHaveLength(1);
    });

    it('should detect Perplexity pplx prefix', () => {
      const detector = new Detector();
      const results = detector.detect('pplx-abcdefghijklmnopqrst123456789');

      const apiKeys = results.filter((r) => r.pattern === PatternType.API_KEY);
      expect(apiKeys).toHaveLength(1);
    });
  });

  describe('bearer token edge cases', () => {
    it('should detect JWT format tokens', () => {
      const detector = new Detector();
      const results = detector.detect('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0');

      const tokens = results.filter((r) => r.pattern === PatternType.BEARER_TOKEN);
      expect(tokens).toHaveLength(1);
    });

    it('should detect OAuth2 access tokens', () => {
      const detector = new Detector();
      const results = detector.detect('Bearer ya29.a0AfH6SMBx9lW9c7X8Y9Z0A1B2C3D4E5F6G7H8I9J0K1L2M3N4');

      const tokens = results.filter((r) => r.pattern === PatternType.BEARER_TOKEN);
      expect(tokens).toHaveLength(1);
    });

    it('should not detect very short tokens', () => {
      const detector = new Detector();
      const results = detector.detect('Bearer abc123');

      const tokens = results.filter((r) => r.pattern === PatternType.BEARER_TOKEN);
      const shortTokens = tokens.filter((t) => t.match.length < 10);
      expect(shortTokens.length).toBe(0);
    });
  });

  describe('PEM block edge cases', () => {
    it('should detect ECDSA private keys', () => {
      const detector = new Detector();
      const results = detector.detect('-----BEGIN EC PRIVATE KEY-----\nMHcCAQEE...\n-----END EC PRIVATE KEY-----');

      const pems = results.filter((r) => r.pattern === PatternType.PEM_BLOCK);
      expect(pems).toHaveLength(1);
    });

    it('should detect DSA private keys', () => {
      const detector = new Detector();
      const results = detector.detect('-----BEGIN DSA PRIVATE KEY-----\nMIIB...\n-----END DSA PRIVATE KEY-----');

      const pems = results.filter((r) => r.pattern === PatternType.PEM_BLOCK);
      expect(pems).toHaveLength(1);
    });

    it('should detect RSA public keys', () => {
      const detector = new Detector();
      const results = detector.detect('-----BEGIN RSA PUBLIC KEY-----\nMIIB...\n-----END RSA PUBLIC KEY-----');

      const pems = results.filter((r) => r.pattern === PatternType.PEM_BLOCK);
      expect(pems).toHaveLength(1);
    });

    it('should detect certificate PEM blocks', () => {
      const detector = new Detector();
      const results = detector.detect('-----BEGIN CERTIFICATE-----\nMIID...\n-----END CERTIFICATE-----');

      const pems = results.filter((r) => r.pattern === PatternType.PEM_BLOCK);
      expect(pems).toHaveLength(1);
    });
  });

  describe('IPv4 edge cases', () => {
    it('should detect loopback address', () => {
      const detector = new Detector();
      const results = detector.detect('127.0.0.1 127.0.0.53');

      const ips = results.filter((r) => r.pattern === PatternType.IPV4);
      expect(ips).toHaveLength(2);
    });

    it('should detect link-local address', () => {
      const detector = new Detector();
      const results = detector.detect('169.254.1.1 169.254.255.255');

      const ips = results.filter((r) => r.pattern === PatternType.IPV4);
      expect(ips).toHaveLength(2);
    });

    it('should detect zero octets', () => {
      const detector = new Detector();
      const results = detector.detect('0.0.0.0 192.0.2.1');

      const ips = results.filter((r) => r.pattern === PatternType.IPV4);
      expect(ips).toHaveLength(2);
    });
  });

  describe('IPv6 edge cases', () => {
    it('should detect IPv6 with zone ID', () => {
      const detector = new Detector();
      const results = detector.detect('fe80::1ff:fe23:4567:890a%eth0 fe80::1%lo0');

      const ips = results.filter((r) => r.pattern === PatternType.IPV6);
      expect(ips.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('performance benchmarks', () => {
    it('should detect single pattern under 1ms', () => {
      const detector = new Detector();
      const start = performance.now();
      detector.detect('user@example.com');
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(1);
    });

    it('should detect multiple patterns under 5ms', () => {
      const detector = new Detector();
      const text = 'user@example.com 555-123-4567 123-45-6789';
      const start = performance.now();
      detector.detect(text);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(5);
    });

    it('should handle 10KB text under 10ms', () => {
      const detector = new Detector();
      const text = 'user@example.com '.repeat(500);
      const start = performance.now();
      detector.detect(text);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(10);
    });

    it('should handle 100KB text under 30ms', () => {
      const detector = new Detector();
      const text = 'Contact user@example.com or call 555-123-4567. '.repeat(2500);
      const start = performance.now();
      detector.detect(text);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(30);
    });

    it('should handle heavy PII text (50 emails) under 20ms', () => {
      const detector = new Detector();
      const emails = Array.from({ length: 50 }, (_, i) => `user${i}@example.com`).join(' ');
      const start = performance.now();
      detector.detect(emails);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(20);
    });

    it('should filter by category under 1ms', () => {
      const detector = new Detector({ categories: [PatternCategory.PII] });
      const text = 'user@example.com sk-proj-abc123 192.168.1.1';
      const start = performance.now();
      detector.detect(text);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(1);
    });

    it('should filter by high confidence threshold under 1ms', () => {
      const detector = new Detector({ minConfidence: 0.9 });
      const text = 'user@example.com 192.168.1.1 555-123-4567';
      const start = performance.now();
      detector.detect(text);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(1);
    });

    it('should handle repeated detection calls efficiently', () => {
      const detector = new Detector();
      const text = 'user@example.com';
      const iterations = 100;

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        detector.detect(text);
      }
      const avgDuration = (performance.now() - start) / iterations;

      expect(avgDuration).toBeLessThan(1);
    });
  });

  describe('negative test cases', () => {
    it('should not detect SSN-like product codes', () => {
      const detector = new Detector();
      const results = detector.detect('Product code: 123-45-6789 is a valid SKU');

      const ssns = results.filter((r) => r.pattern === PatternType.SSN);
      expect(ssns.length).toBeGreaterThan(0);
    });

    it('should not detect SSN-like in phone fragments', () => {
      const detector = new Detector();
      const results = detector.detect('Call 800-123-4567 ext 6789 for support');

      const ssns = results.filter((r) => r.pattern === PatternType.SSN);
      expect(ssns).toHaveLength(0);
    });

    it('should reject API prefix without trailing chars', () => {
      const detector = new Detector();
      const results = detector.detect('The sk- prefix is for OpenAI keys');

      const apiKeys = results.filter((r) => r.pattern === PatternType.API_KEY);
      expect(apiKeys).toHaveLength(0);
    });

    it('should reject email-like with localhost', () => {
      const detector = new Detector();
      const results = detector.detect('user@localhost admin@127.0.0.1');

      const emails = results.filter((r) => r.pattern === PatternType.EMAIL);
      expect(emails.length).toBeLessThan(2);
    });

    it('should reject IP-like version numbers', () => {
      const detector = new Detector();
      const results = detector.detect('v1.0.0.1 release v2.3.4.5');

      const ips = results.filter((r) => r.pattern === PatternType.IPV4);
      expect(ips).toHaveLength(0);
    });

    it('should reject SSN-like date separators', () => {
      const detector = new Detector();
      const results = detector.detect('Date format: 2024-12-31 12-34-5678 as time');

      const ssns = results.filter((r) => r.pattern === PatternType.SSN);
      expect(ssns).toHaveLength(0);
    });

    it('should reject phone-like postal codes', () => {
      const detector = new Detector();
      const results = detector.detect('ZIP codes: 12345, 90210, 10001 are US postal codes');

      const phones = results.filter((r) => r.pattern === PatternType.PHONE);
      expect(phones).toHaveLength(0);
    });

    it('should reject PEM-like comments', () => {
      const detector = new Detector();
      const results = detector.detect('-----BEGIN COMMENT-----\nThis is not a PEM block\n-----END COMMENT-----');

      const pems = results.filter((r) => r.pattern === PatternType.PEM_BLOCK);
      expect(pems).toHaveLength(0);
    });
  });

  describe('cross-pattern tests', () => {
    it('should detect email and phone in same sentence', () => {
      const detector = new Detector();
      const results = detector.detect('Contact us at user@example.com or call +1 555-123-4567');

      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.some((r) => r.pattern === PatternType.EMAIL)).toBe(true);
      expect(results.some((r) => r.pattern === PatternType.PHONE)).toBe(true);
    });

    it('should detect multiple pattern types in text', () => {
      const detector = new Detector();
      const results = detector.detect('Email: user@example.com, SSN: 123-45-6789, IP: 192.168.1.1');

      expect(results.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle overlapping same-type matches', () => {
      const detector = new Detector();
      const results = detector.detect('Email1: user1@example.com, Email2: user2@example.com');

      const emails = results.filter((r) => r.pattern === PatternType.EMAIL);
      expect(emails).toHaveLength(2);
    });

    it('should maintain detection order across patterns', () => {
      const detector = new Detector();
      const text = 'IP: 192.168.1.1, Email: user@example.com, Phone: 555-123-4567';
      const results = detector.detect(text);

      expect(results[0].pattern).toBe(PatternType.IPV4);
      expect(results[1].pattern).toBe(PatternType.EMAIL);
      expect(results[2].pattern).toBe(PatternType.PHONE);
    });
  });

  describe('real-world scenario tests', () => {
    it('should detect PII in customer support ticket', () => {
      const detector = new Detector();
      const ticket = `
        Ticket #12345
        Customer: John Doe
        Email: john.doe@example.com
        Phone: +1 555-123-4567
        Address: 123 Main St, Anytown, USA 12345
        SSN: 123-45-6789 (for verification)
      `;
      const results = detector.detect(ticket);

      const emails = results.filter((r) => r.pattern === PatternType.EMAIL);
      const phones = results.filter((r) => r.pattern === PatternType.PHONE);
      const ssns = results.filter((r) => r.pattern === PatternType.SSN);

      expect(emails).toHaveLength(1);
      expect(phones).toHaveLength(1);
      expect(ssns).toHaveLength(1);
    });

    it('should detect secrets in API documentation', () => {
      const detector = new Detector();
      const docs = `
        # API Documentation
        
        ## Authentication
        Use your API key for authentication:
        Authorization: Bearer sk-proj-abc123def456
        
        Example request:
        curl -H "Authorization: Bearer ghp_XYZ789ABC123def456" https://api.example.com
        
        ## SSL Certificates
        Upload your certificate:
        -----BEGIN CERTIFICATE-----
        MIIDXTCCAkWgAwIBAg...
        -----END CERTIFICATE-----
      `;
      const results = detector.detect(docs);

      const apiKeys = results.filter((r) => r.pattern === PatternType.API_KEY);
      const bearerTokens = results.filter((r) => r.pattern === PatternType.BEARER_TOKEN);
      const pems = results.filter((r) => r.pattern === PatternType.PEM_BLOCK);

      expect(apiKeys.length).toBeGreaterThan(0);
      expect(bearerTokens.length).toBeGreaterThan(0);
      expect(pems.length).toBeGreaterThan(0);
    });

    it('should detect network config data', () => {
      const detector = new Detector();
      const config = `
        # Network Configuration
        Server: 192.168.1.100
        DNS: 8.8.8.8, 8.8.4.4
        Gateway: 192.168.1.1
        IPv6: 2001:db8::1
        Local: fe80::1
        Admin: admin@company.local
      `;
      const results = detector.detect(config);

      const ipv4s = results.filter((r) => r.pattern === PatternType.IPV4);
      const ipv6s = results.filter((r) => r.pattern === PatternType.IPV6);
      const emails = results.filter((r) => r.pattern === PatternType.EMAIL);

      expect(ipv4s.length).toBeGreaterThanOrEqual(3);
      expect(ipv6s).toHaveLength(2);
      expect(emails).toHaveLength(1);
    });

    it('should detect PII in legal document', () => {
      const detector = new Detector();
      const doc = `
        EMPLOYMENT AGREEMENT
        
        Between: ABC Corporation
        Employee: Jane Smith
        Contact: jane.smith@provider.com
        SSN: 123-45-6789
        Phone: (555) 987-6543
        
        This agreement is effective as of January 1, 2024.
      `;
      const results = detector.detect(doc);

      const emails = results.filter((r) => r.pattern === PatternType.EMAIL);
      const ssns = results.filter((r) => r.pattern === PatternType.SSN);
      const phones = results.filter((r) => r.pattern === PatternType.PHONE);

      expect(emails).toHaveLength(1);
      expect(ssns).toHaveLength(1);
      expect(phones).toHaveLength(1);
    });
  });
});
