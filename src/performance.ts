/**
 * Performance monitoring and benchmarking utilities for OpenClaw Guard.
 *
 * Performance Targets:
 * - Detection (100-500 chars): <5ms
 * - Detection (1000-5000 chars): <20ms
 * - Tokenization: <1ms per value
 * - Vault lookup: <2ms
 * - End-to-end round-trip (p50): <30ms
 * - End-to-end round-trip (p99): <50ms
 */

export interface PerformanceMetrics {
  detection: LatencyMetrics;
  tokenization: LatencyMetrics;
  vault: LatencyMetrics;
  endToEnd: LatencyMetrics;
}

export interface LatencyMetrics {
  count: number;
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  p999: number;
}

export interface BenchmarkResult {
  name: string;
  iterations: number;
  totalTime: number;
  opsPerSecond: number;
  latency: LatencyMetrics;
  passed: boolean;
  targetMs?: number;
}

export class PerformanceMonitor {
  private samples: Map<string, number[]>;
  private maxSamples: number;

  constructor(maxSamples = 10000) {
    this.samples = new Map();
    this.maxSamples = maxSamples;
  }

  record(operation: string, durationMs: number): void {
    if (!this.samples.has(operation)) {
      this.samples.set(operation, []);
    }

    const opSamples = this.samples.get(operation)!;
    opSamples.push(durationMs);

    // Keep only the most recent samples
    if (opSamples.length > this.maxSamples) {
      opSamples.shift();
    }
  }

  getMetrics(operation: string): LatencyMetrics | null {
    const opSamples = this.samples.get(operation);
    if (!opSamples || opSamples.length === 0) {
      return null;
    }

    return calculateLatencyMetrics(opSamples);
  }

  getAllMetrics(): PerformanceMetrics {
    return {
      detection: this.getMetrics('detection') || emptyMetrics(),
      tokenization: this.getMetrics('tokenization') || emptyMetrics(),
      vault: this.getMetrics('vault') || emptyMetrics(),
      endToEnd: this.getMetrics('endToEnd') || emptyMetrics()
    };
  }

  clear(): void {
    this.samples.clear();
  }

  clearOperation(operation: string): void {
    this.samples.delete(operation);
  }
}

function emptyMetrics(): LatencyMetrics {
  return {
    count: 0,
    min: 0,
    max: 0,
    mean: 0,
    p50: 0,
    p95: 0,
    p99: 0,
    p999: 0
  };
}

export function calculateLatencyMetrics(samples: number[]): LatencyMetrics {
  if (samples.length === 0) {
    return emptyMetrics();
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const count = sorted.length;
  const min = sorted[0];
  const max = sorted[count - 1];
  const mean = sorted.reduce((a, b) => a + b, 0) / count;

  return {
    count,
    min,
    max,
    mean,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    p999: percentile(sorted, 99.9)
  };
}

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];

  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sortedValues[lower];
  }

  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

export async function benchmark(
  name: string,
  fn: () => void | Promise<void>,
  options: { iterations?: number; warmup?: number; targetMs?: number } = {}
): Promise<BenchmarkResult> {
  const { iterations = 1000, warmup = 100, targetMs } = options;

  // Warmup phase
  for (let i = 0; i < warmup; i++) {
    await fn();
  }

  // Benchmark phase
  const samples: number[] = [];
  const startTotal = performance.now();

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    samples.push(end - start);
  }

  const totalTime = performance.now() - startTotal;
  const latency = calculateLatencyMetrics(samples);
  const opsPerSecond = (iterations / totalTime) * 1000;

  const passed = targetMs === undefined || latency.p50 <= targetMs;

  return {
    name,
    iterations,
    totalTime,
    opsPerSecond,
    latency,
    passed,
    targetMs
  };
}

export function formatBenchmarkResult(result: BenchmarkResult): string {
  const status = result.passed ? '✓' : '✗';
  const target = result.targetMs ? ` (target: ${result.targetMs}ms)` : '';

  return `${status} ${result.name}${target}
    Iterations: ${result.iterations}
    Ops/sec: ${result.opsPerSecond.toFixed(2)}
    Latency:
      Min: ${result.latency.min.toFixed(3)}ms
      Max: ${result.latency.max.toFixed(3)}ms
      Mean: ${result.latency.mean.toFixed(3)}ms
      P50: ${result.latency.p50.toFixed(3)}ms
      P95: ${result.latency.p95.toFixed(3)}ms
      P99: ${result.latency.p99.toFixed(3)}ms`;
}

// Singleton performance monitor for global use
let globalMonitor: PerformanceMonitor | null = null;

export function getGlobalPerformanceMonitor(): PerformanceMonitor {
  if (!globalMonitor) {
    globalMonitor = new PerformanceMonitor();
  }
  return globalMonitor;
}

export function resetGlobalPerformanceMonitor(): void {
  globalMonitor = null;
}
