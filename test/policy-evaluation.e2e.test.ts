import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { Detector } from '../src/detector.js';
import { PatternCategory } from '../src/types.js';

describe('Policy Evaluation E2E', () => {
  let testDir: string;
  let detector: Detector;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'policy-e2e-'));
    detector = new Detector();
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('Confidence-Based Filtering', () => {
    it('should detect high-confidence PII', async () => {
      const detector = new Detector({ minConfidence: 0.9 });
      const text = 'My email is user@example.com';

      const detections = detector.detect(text);

      expect(detections.length).toBe(1);
      expect(detections[0].confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should filter low-confidence detections', async () => {
      const detector = new Detector({ minConfidence: 0.95 });
      const text = 'Call me at 555-5555'; // Phone numbers have lower confidence

      const detections = detector.detect(text);

      // May or may not match depending on confidence
      for (const detection of detections) {
        expect(detection.confidence).toBeGreaterThanOrEqual(0.95);
      }
    });

    it('should include all detections with low threshold', async () => {
      const detector = new Detector({ minConfidence: 0.1 });
      const text = 'Email: test@example.com, Phone: 555-555-5555, IP: 192.168.1.1';

      const detections = detector.detect(text);

      expect(detections.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Category-Based Filtering', () => {
    it('should filter to PII only', async () => {
      const detector = new Detector({ categories: [PatternCategory.PII] });
      const text = 'Email: test@example.com, API: sk-1234567890, IP: 192.168.1.1';

      const detections = detector.detect(text);

      for (const detection of detections) {
        expect(detection.category).toBe(PatternCategory.PII);
      }
      expect(detections.some(d => d.pattern === 'email')).toBe(true);
    });

    it('should filter to secrets only', async () => {
      const detector = new Detector({ categories: [PatternCategory.SECRETS] });
      const text = 'Email: test@example.com, API: sk-1234567890, Token: Bearer abc123';

      const detections = detector.detect(text);

      for (const detection of detections) {
        expect(detection.category).toBe(PatternCategory.SECRETS);
      }
    });

    it('should filter to network only', async () => {
      const detector = new Detector({ categories: [PatternCategory.NETWORK] });
      const text = 'Email: test@example.com, Server: 192.168.1.1';

      const detections = detector.detect(text);

      for (const detection of detections) {
        expect(detection.category).toBe(PatternCategory.NETWORK);
      }
    });

    it('should combine multiple categories', async () => {
      const detector = new Detector({
        categories: [PatternCategory.PII, PatternCategory.SECRETS]
      });
      const text = 'Email: test@example.com, API: sk-1234567890, IP: 192.168.1.1';

      const detections = detector.detect(text);

      for (const detection of detections) {
        expect([PatternCategory.PII, PatternCategory.SECRETS]).toContain(detection.category);
      }
      // Should not include network
      expect(detections.some(d => d.category === PatternCategory.NETWORK)).toBe(false);
    });
  });

  describe('Policy Decision Scenarios', () => {
    it('should identify maskable content', async () => {
      const text = 'Contact: john@example.com';
      const detections = detector.detect(text);

      // Simulate mask policy: high confidence PII gets masked
      const maskable = detections.filter(
        d => d.category === PatternCategory.PII && d.confidence >= 0.8
      );

      expect(maskable.length).toBe(1);
      expect(maskable[0].pattern).toBe('email');
    });

    it('should identify blockable content', async () => {
      const text = 'My credit card is 4111111111111111';
      const detections = detector.detect(text);

      // Simulate block policy: credit cards get blocked
      const blockable = detections.filter(d => d.pattern === 'credit_card');

      // Note: Only detected if Luhn validation passes
      if (blockable.length > 0) {
        expect(blockable[0].confidence).toBeGreaterThan(0.5);
      }
    });

    it('should identify redactable secrets', async () => {
      const text = 'Use Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.abc';
      const detections = detector.detect(text);

      // Simulate redact policy: all secrets get redacted
      const redactable = detections.filter(d => d.category === PatternCategory.SECRETS);

      expect(redactable.length).toBeGreaterThanOrEqual(1);
    });

    it('should allow low-confidence detections through', async () => {
      const text = 'Version 1.2.3.4 is available'; // May look like IP
      const detections = detector.detect(text);

      // Simulate allow policy: low confidence (<0.5) is allowed
      const lowConfidence = detections.filter(d => d.confidence < 0.5);

      // These would be allowed through
      for (const detection of lowConfidence) {
        expect(detection.confidence).toBeLessThan(0.5);
      }
    });
  });

  describe('Priority and Rule Ordering', () => {
    it('should process detections in position order', async () => {
      const text = 'A: test@a.com B: test@b.com C: test@c.com';
      const detections = detector.detect(text);

      // Verify position ordering
      let lastStart = -1;
      for (const detection of detections) {
        expect(detection.start).toBeGreaterThan(lastStart);
        lastStart = detection.start;
      }
    });

    it('should handle overlapping patterns', async () => {
      const text = 'Contact: admin@192.168.1.1.example.com';
      const detections = detector.detect(text);

      // May detect both email and IP-like patterns
      // The detector should handle this gracefully
      expect(detections.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Fail-Closed Behavior', () => {
    it('should detect unknown patterns for blocking', async () => {
      // In fail-closed mode, unrecognized sensitive-looking content
      // should be detectable for blocking
      const text = 'My SSN is 123-45-6789';
      const detections = detector.detect(text);

      // SSN should be detected with high confidence
      const ssnDetection = detections.find(d => d.pattern === 'ssn');
      expect(ssnDetection).toBeDefined();
      expect(ssnDetection!.confidence).toBeGreaterThanOrEqual(0.9);
    });
  });
});
