import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { Detector } from '../src/detector.js';

describe('Masking Round-trip E2E', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'roundtrip-e2e-'));
    process.env.GUARD_VAULT_PATH = path.join(testDir, 'vault.db');
    process.env.GUARD_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('Detection and Tokenization', () => {
    it('should detect email in user message', async () => {
      const detector = new Detector();
      const userMessage = 'Please contact me at john.doe@example.com for more info.';

      const detections = detector.detect(userMessage);

      expect(detections).toHaveLength(1);
      expect(detections[0].pattern).toBe('email');
      expect(detections[0].match).toBe('john.doe@example.com');
      expect(detections[0].confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should detect phone number in user message', async () => {
      const detector = new Detector();
      const userMessage = 'Call me at (555) 123-4567 tomorrow.';

      const detections = detector.detect(userMessage);

      expect(detections).toHaveLength(1);
      expect(detections[0].pattern).toBe('phone');
      expect(detections[0].match).toContain('555');
    });

    it('should detect multiple PII types in single message', async () => {
      const detector = new Detector();
      const userMessage = `
        My name is John Doe.
        Email: john@example.com
        Phone: (555) 123-4567
        SSN: 123-45-6789
      `;

      const detections = detector.detect(userMessage);

      // Should detect email, phone, and SSN
      expect(detections.length).toBeGreaterThanOrEqual(3);

      const types = detections.map(d => d.pattern);
      expect(types).toContain('email');
      expect(types).toContain('phone');
      expect(types).toContain('ssn');
    });

    it('should detect secrets in conversation', async () => {
      const detector = new Detector();
      const message = 'Use this API key: sk-1234567890abcdefghij';

      const detections = detector.detect(message);

      expect(detections.length).toBeGreaterThanOrEqual(1);
      const apiKeyDetection = detections.find(d => d.pattern === 'api_key');
      expect(apiKeyDetection).toBeDefined();
    });

    it('should detect Bearer tokens', async () => {
      const detector = new Detector();
      const message = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';

      const detections = detector.detect(message);

      expect(detections.length).toBeGreaterThanOrEqual(1);
      const tokenDetection = detections.find(d => d.pattern === 'bearer_token');
      expect(tokenDetection).toBeDefined();
    });

    it('should detect PEM blocks', async () => {
      const detector = new Detector();
      const message = `
        Here's my key:
        -----BEGIN RSA PRIVATE KEY-----
        MIIBogIBAAJBALRiMLAHudeSA2HrqHWiFn5ER6fPV8TqVU
        -----END RSA PRIVATE KEY-----
      `;

      const detections = detector.detect(message);

      expect(detections.length).toBeGreaterThanOrEqual(1);
      const pemDetection = detections.find(d => d.pattern === 'pem_block');
      expect(pemDetection).toBeDefined();
      expect(pemDetection!.confidence).toBe(1.0);
    });

    it('should detect IP addresses', async () => {
      const detector = new Detector();
      const message = 'Connect to server at 192.168.1.100 on port 8080';

      const detections = detector.detect(message);

      const ipDetection = detections.find(d => d.pattern === 'ipv4');
      expect(ipDetection).toBeDefined();
      expect(ipDetection!.match).toBe('192.168.1.100');
    });

    it('should maintain detection order', async () => {
      const detector = new Detector();
      const message = 'First: test@a.com, then: 555-555-5555, finally: 123-45-6789';

      const detections = detector.detect(message);

      // Verify detections are ordered by position
      for (let i = 1; i < detections.length; i++) {
        expect(detections[i].start).toBeGreaterThanOrEqual(detections[i - 1].start);
      }
    });
  });

  describe('Real Conversation Scenarios', () => {
    it('should handle customer support ticket', async () => {
      const detector = new Detector();
      const ticket = `
        Subject: Account Access Issue

        Dear Support,

        I'm having trouble accessing my account. My details:
        - Email: customer@company.com
        - Phone: +1 (555) 987-6543
        - Last 4 of CC: 4242

        Please help me reset my password.

        Thanks,
        Jane Smith
      `;

      const detections = detector.detect(ticket);

      expect(detections.length).toBeGreaterThanOrEqual(2);
      expect(detections.some(d => d.pattern === 'email')).toBe(true);
      expect(detections.some(d => d.pattern === 'phone')).toBe(true);
    });

    it('should handle API documentation with examples', async () => {
      const detector = new Detector();
      const docs = `
        # API Authentication

        Use your API key in the header:
        \`\`\`
        Authorization: Bearer sk-live-abc123def456
        \`\`\`

        Example request:
        \`\`\`bash
        curl -H "Authorization: Bearer ghp_1234567890abcdef" https://api.example.com
        \`\`\`
      `;

      const detections = detector.detect(docs);

      // Should detect API keys and bearer tokens
      expect(detections.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle network configuration', async () => {
      const detector = new Detector();
      const config = `
        Server Configuration:
        - Primary: 10.0.0.1
        - Secondary: 10.0.0.2
        - IPv6: 2001:db8::1

        Firewall rules allow traffic from 192.168.0.0/24
      `;

      const detections = detector.detect(config);

      const ips = detections.filter(d => d.pattern === 'ipv4' || d.pattern === 'ipv6');
      expect(ips.length).toBeGreaterThanOrEqual(3);
    });
  });
});
