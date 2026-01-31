import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { Detector } from '../src/detector.js';

describe('Streaming Chunks E2E', () => {
  let testDir: string;
  let detector: Detector;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'streaming-e2e-'));
    detector = new Detector();
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('Chunk Boundary Detection', () => {
    it('should detect email in single chunk', async () => {
      const chunk = 'My email is user@example.com';
      const detections = detector.detect(chunk);

      expect(detections).toHaveLength(1);
      expect(detections[0].match).toBe('user@example.com');
    });

    it('should detect pattern at chunk start', async () => {
      const chunk = 'user@example.com is my email';
      const detections = detector.detect(chunk);

      expect(detections).toHaveLength(1);
      expect(detections[0].start).toBe(0);
    });

    it('should detect pattern at chunk end', async () => {
      const chunk = 'Contact me at user@example.com';
      const detections = detector.detect(chunk);

      expect(detections).toHaveLength(1);
      expect(detections[0].end).toBe(chunk.length);
    });

    it('should handle multiple patterns in chunk', async () => {
      const chunk = 'Email: a@b.com Phone: 555-555-5555';
      const detections = detector.detect(chunk);

      expect(detections.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Simulated Streaming', () => {
    it('should detect across accumulated chunks', async () => {
      // Simulate streaming by accumulating chunks
      const chunks = [
        'Hello, my ',
        'email is user',
        '@example.com'
      ];

      // Accumulate chunks as they arrive
      let accumulated = '';
      for (const chunk of chunks) {
        accumulated += chunk;
      }

      const detections = detector.detect(accumulated);

      expect(detections).toHaveLength(1);
      expect(detections[0].match).toBe('user@example.com');
    });

    it('should handle phone split across chunks', async () => {
      const chunks = [
        'Call me at (',
        '555) 123',
        '-4567 please'
      ];

      const accumulated = chunks.join('');
      const detections = detector.detect(accumulated);

      expect(detections.some(d => d.pattern === 'phone')).toBe(true);
    });

    it('should handle SSN split across chunks', async () => {
      const chunks = [
        'My SSN is 12',
        '3-45-',
        '6789'
      ];

      const accumulated = chunks.join('');
      const detections = detector.detect(accumulated);

      expect(detections.some(d => d.pattern === 'ssn')).toBe(true);
    });

    it('should handle IP address split across chunks', async () => {
      const chunks = [
        'Server at 192.',
        '168.1',
        '.100'
      ];

      const accumulated = chunks.join('');
      const detections = detector.detect(accumulated);

      expect(detections.some(d => d.pattern === 'ipv4')).toBe(true);
    });
  });

  describe('Large Text Handling', () => {
    it('should handle medium-sized text efficiently', async () => {
      const paragraphs = Array(10).fill(
        'This is a paragraph with an email user@example.com and phone 555-555-5555. '
      );
      const text = paragraphs.join('\n');

      const start = performance.now();
      const detections = detector.detect(text);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(100); // Should complete in <100ms
      expect(detections.length).toBeGreaterThan(10);
    });

    it('should handle repeated patterns', async () => {
      const emails = Array(100).fill('test@example.com').join(' ');

      const detections = detector.detect(emails);

      // Should detect multiple unique positions
      expect(detections.length).toBe(100);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty text', async () => {
      const detections = detector.detect('');
      expect(detections).toHaveLength(0);
    });

    it('should handle text with no patterns', async () => {
      const text = 'This is just regular text with no sensitive data.';
      const detections = detector.detect(text);
      expect(detections).toHaveLength(0);
    });

    it('should handle whitespace-only text', async () => {
      const detections = detector.detect('   \n\t   ');
      expect(detections).toHaveLength(0);
    });

    it('should handle unicode text', async () => {
      const text = 'Contact: user@example.com (日本語テスト)';
      const detections = detector.detect(text);

      expect(detections).toHaveLength(1);
      expect(detections[0].pattern).toBe('email');
    });

    it('should handle very long lines', async () => {
      const longLine = 'x'.repeat(10000) + ' user@example.com ' + 'y'.repeat(10000);
      const detections = detector.detect(longLine);

      expect(detections).toHaveLength(1);
      expect(detections[0].match).toBe('user@example.com');
    });
  });

  describe('Performance', () => {
    it('should detect in short text under 5ms', async () => {
      const text = 'Contact: user@example.com';

      const samples: number[] = [];
      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        detector.detect(text);
        samples.push(performance.now() - start);
      }

      const p50 = samples.sort((a, b) => a - b)[50];
      expect(p50).toBeLessThan(5);
    });

    it('should detect in medium text under 20ms', async () => {
      const text = `
        Customer support ticket #12345

        Dear support team,

        I need help with my account. My details:
        - Email: customer@company.com
        - Phone: +1 (555) 987-6543
        - Account ID: ACC-123456

        The issue I'm experiencing is...
      `.repeat(10);

      const samples: number[] = [];
      for (let i = 0; i < 20; i++) {
        const start = performance.now();
        detector.detect(text);
        samples.push(performance.now() - start);
      }

      const p50 = samples.sort((a, b) => a - b)[10];
      expect(p50).toBeLessThan(20);
    });
  });
});
