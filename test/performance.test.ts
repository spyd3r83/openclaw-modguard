import { describe, it, expect, beforeEach } from 'vitest';
import {
  PerformanceMonitor,
  calculateLatencyMetrics,
  benchmark,
  formatBenchmarkResult,
  getGlobalPerformanceMonitor,
  resetGlobalPerformanceMonitor
} from '../src/performance.js';
import { Detector } from '../src/detector.js';

describe('Performance Utilities', () => {
  describe('PerformanceMonitor', () => {
    let monitor: PerformanceMonitor;

    beforeEach(() => {
      monitor = new PerformanceMonitor();
    });

    it('should record samples', () => {
      monitor.record('test', 10);
      monitor.record('test', 20);
      monitor.record('test', 30);

      const metrics = monitor.getMetrics('test');
      expect(metrics).not.toBeNull();
      expect(metrics!.count).toBe(3);
    });

    it('should calculate correct min/max/mean', () => {
      monitor.record('test', 10);
      monitor.record('test', 20);
      monitor.record('test', 30);

      const metrics = monitor.getMetrics('test');
      expect(metrics!.min).toBe(10);
      expect(metrics!.max).toBe(30);
      expect(metrics!.mean).toBe(20);
    });

    it('should return null for unknown operation', () => {
      const metrics = monitor.getMetrics('unknown');
      expect(metrics).toBeNull();
    });

    it('should limit samples to maxSamples', () => {
      const smallMonitor = new PerformanceMonitor(3);
      smallMonitor.record('test', 10);
      smallMonitor.record('test', 20);
      smallMonitor.record('test', 30);
      smallMonitor.record('test', 40);
      smallMonitor.record('test', 50);

      const metrics = smallMonitor.getMetrics('test');
      expect(metrics!.count).toBe(3);
      expect(metrics!.min).toBe(30); // Oldest samples dropped
    });

    it('should clear all samples', () => {
      monitor.record('test1', 10);
      monitor.record('test2', 20);
      monitor.clear();

      expect(monitor.getMetrics('test1')).toBeNull();
      expect(monitor.getMetrics('test2')).toBeNull();
    });

    it('should clear specific operation', () => {
      monitor.record('test1', 10);
      monitor.record('test2', 20);
      monitor.clearOperation('test1');

      expect(monitor.getMetrics('test1')).toBeNull();
      expect(monitor.getMetrics('test2')).not.toBeNull();
    });

    it('should get all metrics', () => {
      monitor.record('detection', 5);
      monitor.record('tokenization', 1);
      monitor.record('vault', 2);
      monitor.record('endToEnd', 25);

      const all = monitor.getAllMetrics();
      expect(all.detection.count).toBe(1);
      expect(all.tokenization.count).toBe(1);
      expect(all.vault.count).toBe(1);
      expect(all.endToEnd.count).toBe(1);
    });
  });

  describe('calculateLatencyMetrics', () => {
    it('should handle empty array', () => {
      const metrics = calculateLatencyMetrics([]);
      expect(metrics.count).toBe(0);
      expect(metrics.min).toBe(0);
      expect(metrics.max).toBe(0);
    });

    it('should handle single value', () => {
      const metrics = calculateLatencyMetrics([42]);
      expect(metrics.count).toBe(1);
      expect(metrics.min).toBe(42);
      expect(metrics.max).toBe(42);
      expect(metrics.mean).toBe(42);
      expect(metrics.p50).toBe(42);
    });

    it('should calculate percentiles correctly', () => {
      // 100 values from 1 to 100
      const samples = Array.from({ length: 100 }, (_, i) => i + 1);
      const metrics = calculateLatencyMetrics(samples);

      expect(metrics.count).toBe(100);
      expect(metrics.min).toBe(1);
      expect(metrics.max).toBe(100);
      expect(metrics.mean).toBeCloseTo(50.5, 1);
      expect(metrics.p50).toBeCloseTo(50.5, 1);
      expect(metrics.p95).toBeCloseTo(95.05, 1);
      expect(metrics.p99).toBeCloseTo(99.01, 1);
    });

    it('should handle unsorted input', () => {
      const samples = [30, 10, 50, 20, 40];
      const metrics = calculateLatencyMetrics(samples);

      expect(metrics.min).toBe(10);
      expect(metrics.max).toBe(50);
      expect(metrics.mean).toBe(30);
    });
  });

  describe('benchmark', () => {
    it('should run benchmarks', async () => {
      let counter = 0;
      const result = await benchmark(
        'counter increment',
        () => { counter++; },
        { iterations: 100, warmup: 10 }
      );

      expect(result.name).toBe('counter increment');
      expect(result.iterations).toBe(100);
      expect(counter).toBe(110); // warmup + iterations
      expect(result.opsPerSecond).toBeGreaterThan(0);
    });

    it('should support async functions', async () => {
      const result = await benchmark(
        'async delay',
        async () => { await new Promise(r => setTimeout(r, 1)); },
        { iterations: 5, warmup: 1 }
      );

      expect(result.latency.mean).toBeGreaterThanOrEqual(1);
    });

    it('should check target', async () => {
      const fastResult = await benchmark(
        'fast',
        () => { let x = 1 + 1; },
        { iterations: 10, warmup: 5, targetMs: 1000 }
      );
      expect(fastResult.passed).toBe(true);

      const slowResult = await benchmark(
        'slow',
        async () => { await new Promise(r => setTimeout(r, 10)); },
        { iterations: 5, warmup: 1, targetMs: 1 }
      );
      expect(slowResult.passed).toBe(false);
    });
  });

  describe('formatBenchmarkResult', () => {
    it('should format passed result', () => {
      const result = {
        name: 'test',
        iterations: 100,
        totalTime: 50,
        opsPerSecond: 2000,
        latency: {
          count: 100,
          min: 0.1,
          max: 1.0,
          mean: 0.5,
          p50: 0.45,
          p95: 0.9,
          p99: 0.95,
          p999: 0.99
        },
        passed: true,
        targetMs: 1
      };

      const formatted = formatBenchmarkResult(result);
      expect(formatted).toContain('✓');
      expect(formatted).toContain('test');
      expect(formatted).toContain('target: 1ms');
    });

    it('should format failed result', () => {
      const result = {
        name: 'slow test',
        iterations: 10,
        totalTime: 1000,
        opsPerSecond: 10,
        latency: {
          count: 10,
          min: 50,
          max: 150,
          mean: 100,
          p50: 100,
          p95: 140,
          p99: 150,
          p999: 150
        },
        passed: false,
        targetMs: 5
      };

      const formatted = formatBenchmarkResult(result);
      expect(formatted).toContain('✗');
    });
  });

  describe('Global PerformanceMonitor', () => {
    beforeEach(() => {
      resetGlobalPerformanceMonitor();
    });

    it('should return singleton instance', () => {
      const m1 = getGlobalPerformanceMonitor();
      const m2 = getGlobalPerformanceMonitor();
      expect(m1).toBe(m2);
    });

    it('should reset singleton', () => {
      const m1 = getGlobalPerformanceMonitor();
      m1.record('test', 10);

      resetGlobalPerformanceMonitor();

      const m2 = getGlobalPerformanceMonitor();
      expect(m2.getMetrics('test')).toBeNull();
    });
  });
});

describe('Detector Performance', () => {
  describe('Detection benchmarks', () => {
    const detector = new Detector();

    it('should detect short text in <5ms', async () => {
      const shortText = 'Contact me at john@example.com or call 555-123-4567';

      const result = await benchmark(
        'short text detection',
        () => { detector.detect(shortText); },
        { iterations: 100, warmup: 20, targetMs: 5 }
      );

      expect(result.passed).toBe(true);
      expect(result.latency.p50).toBeLessThan(5);
    });

    it('should detect medium text in <10ms', async () => {
      const mediumText = `
        Dear Customer Support,

        I'm writing to report an issue with my account. My email is customer@example.com
        and my phone number is (555) 123-4567. For verification, my SSN ends in 4321.

        My credit card ending in 4242 was charged incorrectly. Please reach out to me
        at my alternate email: support.request@company.org or call +1-555-987-6543.

        The API key you provided (sk-test-abc123def456) doesn't seem to work.

        Best regards,
        A concerned customer
      `;

      const result = await benchmark(
        'medium text detection',
        () => { detector.detect(mediumText); },
        { iterations: 100, warmup: 20, targetMs: 10 }
      );

      expect(result.passed).toBe(true);
      expect(result.latency.p50).toBeLessThan(10);
    });

    it('should handle repeated detection efficiently', async () => {
      const text = 'Email: test@example.com, Phone: 555-555-5555';

      // Warm up cache
      for (let i = 0; i < 10; i++) {
        detector.detect(text);
      }

      const samples: number[] = [];
      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        detector.detect(text);
        samples.push(performance.now() - start);
      }

      const metrics = calculateLatencyMetrics(samples);
      expect(metrics.p50).toBeLessThan(5);
    });
  });

  describe('Regex caching', () => {
    it('should reuse compiled regex patterns', () => {
      const detector = new Detector();

      // Get patterns - internal check that regex is cached
      const patterns = detector.getPatterns();
      expect(patterns.length).toBeGreaterThan(0);

      // Run detection multiple times
      const text = 'test@example.com';
      for (let i = 0; i < 10; i++) {
        detector.detect(text);
      }

      // No way to directly verify caching, but if it crashes or produces
      // inconsistent results, the caching is broken
      const results = detector.detect(text);
      expect(results.length).toBe(1);
      expect(results[0].match).toBe('test@example.com');
    });

    it('should rebuild cache when patterns updated', () => {
      const detector = new Detector();
      const originalPatterns = detector.getPatterns();

      // Update with subset of patterns
      detector.updatePatterns(originalPatterns.slice(0, 2));

      const text = 'test@example.com 555-555-5555';
      const results = detector.detect(text);

      // Should still work correctly
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
