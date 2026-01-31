import { describe, it, expect } from 'vitest';
import { Detector } from '../src/detector.js';
import { PatternCategory } from '../src/types.js';

describe('Detector Performance', () => {
  describe('single pattern detection', () => {
    it('should detect single pattern under 5ms', () => {
      const detector = new Detector();
      const start = performance.now();
      detector.detect('user@example.com');
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(5);
    });
  });

  describe('multiple pattern detection', () => {
    it('should detect multiple patterns under 5ms', () => {
      const detector = new Detector();
      const text = 'user@example.com 555-123-4567 123-45-6789';
      const start = performance.now();
      detector.detect(text);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(5);
    });
  });

  describe('text length benchmarks', () => {
    it('should handle 1KB text under 5ms', () => {
      const detector = new Detector();
      const text = 'user@example.com '.repeat(50);
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
  });

  describe('PII density benchmarks', () => {
    it('should handle 0% match density - 10KB under 5ms', () => {
      const detector = new Detector();
      const text = 'This is plain text without any PII or sensitive data patterns. '.repeat(200);
      const start = performance.now();
      detector.detect(text);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(5);
    });

    it('should handle 10% match density - 10KB under 10ms', () => {
      const detector = new Detector();
      const pii = 'user@example.com ';
      const plain = 'Regular text content here. ';
      const text = (plain.repeat(9) + pii).repeat(50);
      const start = performance.now();
      detector.detect(text);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(10);
    });

    it('should handle 50% match density - 10KB under 20ms', () => {
      const detector = new Detector();
      const pii1 = 'user@example.com ';
      const pii2 = '555-123-4567 ';
      const text = (pii1 + pii2).repeat(250);
      const start = performance.now();
      detector.detect(text);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(20);
    });

    it('should handle 0% match density - 100KB under 10ms', () => {
      const detector = new Detector();
      const text = 'This is plain text without any PII or sensitive data patterns. '.repeat(2000);
      const start = performance.now();
      detector.detect(text);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(10);
    });

    it('should handle 10% match density - 100KB under 30ms', () => {
      const detector = new Detector();
      const pii = 'user@example.com ';
      const plain = 'Regular text content here. ';
      const text = (plain.repeat(9) + pii).repeat(500);
      const start = performance.now();
      detector.detect(text);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(30);
    });

    it('should handle 50% match density - 100KB under 50ms', () => {
      const detector = new Detector();
      const pii1 = 'user@example.com ';
      const pii2 = '555-123-4567 ';
      const text = (pii1 + pii2).repeat(2500);
      const start = performance.now();
      detector.detect(text);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(50);
    });
  });

  describe('heavy PII load', () => {
    it('should handle heavy PII text (50 emails) under 20ms', () => {
      const detector = new Detector();
      const emails = Array.from({ length: 50 }, (_, i) => `user${i}@example.com`).join(' ');
      const start = performance.now();
      detector.detect(emails);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(20);
    });
  });

  describe('filtering performance', () => {
    it('should filter by category under 5ms', () => {
      const detector = new Detector({ categories: [PatternCategory.PII] });
      const text = 'user@example.com sk-proj-abc123 192.168.1.1';
      const start = performance.now();
      detector.detect(text);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(5);
    });

    it('should filter by high confidence threshold under 5ms', () => {
      const detector = new Detector({ minConfidence: 0.9 });
      const text = 'user@example.com 192.168.1.1 555-123-4567';
      const start = performance.now();
      detector.detect(text);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(5);
    });
  });

  describe('repeated detection', () => {
    it('should handle repeated detection calls efficiently', () => {
      const detector = new Detector();
      const text = 'user@example.com';
      const iterations = 100;

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        detector.detect(text);
      }
      const avgDuration = (performance.now() - start) / iterations;

      expect(avgDuration).toBeLessThan(5);
    });
  });
});
