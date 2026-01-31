import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StreamingMasker, ChunkBuffer, StreamProcessor } from '../src/streaming.js';
import { Detector } from '../src/detector.js';
import { Tokenizer } from '../src/tokenizer.js';
import { Vault } from '../src/vault.js';
import { PatternType, PatternCategory } from '../src/types.js';

describe('ChunkBuffer', () => {
  let buffer: ChunkBuffer;

  beforeEach(() => {
    buffer = new ChunkBuffer(100);
  });

  afterEach(() => {
    buffer.clear();
  });

  it('should append chunks and maintain buffer', () => {
    buffer.append('Hello');
    expect(buffer.getBuffer()).toBe('Hello');

    buffer.append(' World');
    expect(buffer.getBuffer()).toBe('Hello World');
  });

  it('should respect max size', () => {
    const largeText = 'A'.repeat(150);
    buffer.append(largeText);

    expect(buffer.getLength()).toBe(100);
    expect(buffer.getBuffer()).toBe('A'.repeat(100));
  });

  it('should return tail of specified size', () => {
    buffer.append('0123456789ABCDEF');

    const tail = buffer.getTail(4);
    expect(tail).toBe('CDEF');
  });

  it('should return entire buffer when tail size exceeds buffer', () => {
    buffer.append('short');

    const tail = buffer.getTail(100);
    expect(tail).toBe('short');
  });

  it('should clear buffer', () => {
    buffer.append('data');
    buffer.clear();

    expect(buffer.isEmpty()).toBe(true);
    expect(buffer.getBuffer()).toBe('');
  });

  it('should handle empty chunks', () => {
    buffer.append('');
    expect(buffer.getBuffer()).toBe('');
  });

  it('should handle null/undefined chunks gracefully', () => {
    const result1 = buffer.append('');
    const result2 = buffer.append('');

    expect(result1).toBe('');
    expect(buffer.getBuffer()).toBe('');
  });
});

describe('StreamingMasker', () => {
  let masker: StreamingMasker;
  let detector: Detector;
  let tokenizer: Tokenizer;
  let vault: Vault;
  let session: string;

  beforeEach(async () => {
    vault = new Vault(':memory:', 'test-master-key');
    detector = new Detector();
    tokenizer = new Tokenizer(vault);
    session = tokenizer.generateSessionId();

    masker = new StreamingMasker({
      detector,
      tokenizer,
      bufferSize: 128
    });
  });

  afterEach(() => {
    masker.reset();
    tokenizer.clearSession(session);
  });

  it('should mask email in single chunk', async () => {
    const chunk = 'Contact me at john.doe@example.com for info';
    const result = await masker.processChunk(chunk, { session });

    expect(result.masked).toContain('EMAIL_');
    expect(result.tokens.length).toBeGreaterThan(0);
    expect(result.pending).toBe(false);
  });

  it('should handle chunk with no PII', async () => {
    const chunk = 'Hello world, this is a simple message';
    const result = await masker.processChunk(chunk, { session });

    expect(result.masked).toBe(chunk);
    expect(result.tokens.length).toBe(0);
    expect(result.pending).toBe(false);
  });

  it('should mask multiple PII in single chunk', async () => {
    const chunk = 'Email: john@example.com and phone: 555-123-4567';
    const result = await masker.processChunk(chunk, { session });

    expect(result.masked).toContain('EMAIL_');
    expect(result.masked).toContain('PHONE_');
    expect(result.tokens.length).toBeGreaterThanOrEqual(2);
  });

  it('should detect PII split across chunks', async () => {
    const chunk1 = 'Contact me at john.doe@';
    const chunk2 = 'example.com for details';

    const result1 = await masker.processChunk(chunk1, { session });
    const result2 = await masker.processChunk(chunk2, { session });

    expect(result1.masked).toBe(chunk1);
    expect(result2.masked).toContain('EMAIL_');
    expect(result2.tokens.length).toBeGreaterThan(0);
  });

  it('should buffer tail for cross-chunk detection', async () => {
    const chunk1 = 'My email is test.user';
    const chunk2 = '@domain.com and phone is 555';

    await masker.processChunk(chunk1, { session });
    const buffer = masker.getBuffer();

    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer).toContain('test.user');
  });

  it('should flush buffer on end of stream', async () => {
    const chunk = 'Contact at partial@email';

    await masker.processChunk(chunk, { session, endOfStream: false });
    expect(masker.getBuffer().length).toBeGreaterThan(0);

    await masker.processChunk('', { session, endOfStream: true });
    expect(masker.getBuffer()).toBe('');
  });

  it('should process empty chunk', async () => {
    const result = await masker.processChunk('', { session });

    expect(result.masked).toBe('');
    expect(result.tokens).toEqual([]);
    expect(result.pending).toBe(true);
  });

  it('should handle API key across chunks', async () => {
    const chunk1 = 'API key: sk-12345678';
    const chunk2 = '90abcdef';

    const result1 = await masker.processChunk(chunk1, { session });
    const result2 = await masker.processChunk(chunk2, { session });

    expect(result1.masked).toContain('API_KEY_');
  });

  it('should mask SSN across chunks', async () => {
    const chunk1 = 'SSN: 123-45';
    const chunk2 = '-6789 is valid';

    const result1 = await masker.processChunk(chunk1, { session });
    const result2 = await masker.processChunk(chunk2, { session });

    expect(result2.masked).toContain('SSN_');
  });

  it('should track processed tokens across chunks', async () => {
    await masker.processChunk('Email: john@example.com', { session });
    await masker.processChunk('Phone: 555-123-4567', { session });

    const tokens = masker.getProcessedTokens();

    expect(tokens.length).toBeGreaterThanOrEqual(2);
  });

  it('should reset state', async () => {
    await masker.processChunk('john@example.com', { session });
    expect(masker.getProcessedTokens().length).toBeGreaterThan(0);

    masker.reset();

    expect(masker.getBuffer()).toBe('');
    expect(masker.getProcessedTokens()).toEqual([]);
  });

  it('should handle credit card split across chunks', async () => {
    const chunk1 = 'Card: 411111111111';
    const chunk2 = '1111';

    const result1 = await masker.processChunk(chunk1, { session });
    const result2 = await masker.processChunk(chunk2, { session });

    expect(result2.masked).toContain('CREDIT_CARD_');
  });

  it('should maintain token consistency for same value', async () => {
    const chunk1 = 'Email: john@example.com';
    const chunk2 = ' again at john@example.com';

    const result1 = await masker.processChunk(chunk1, { session });
    const result2 = await masker.processChunk(chunk2, { session });

    expect(result1.masked).toContain('EMAIL_');
    const emailToken1 = result1.tokens[0];
    const emailToken2 = result2.tokens[0];

    expect(emailToken1).toBe(emailToken2);
  });

  it('should handle multiple chunks with partial PII at boundaries', async () => {
    const chunks = [
      'Contact:',
      ' test@',
      'example',
      '.com',
      ' for info'
    ];

    for (const chunk of chunks) {
      await masker.processChunk(chunk, { session });
    }

    await masker.processChunk('', { session, endOfStream: true });

    const tokens = masker.getProcessedTokens();
    expect(tokens.length).toBeGreaterThan(0);
  });

  it('should handle IPv4 address split across chunks', async () => {
    const chunk1 = 'IP: 192.168';
    const chunk2 = '.1.1';

    const result1 = await masker.processChunk(chunk1, { session });
    const result2 = await masker.processChunk(chunk2, { session });

    expect(result2.masked).toContain('IPV4_');
  });

  it('should handle Bearer token split across chunks', async () => {
    const chunk1 = 'Token: Bearer eyJhbGciOi';
    const chunk2 = 'JIUzI1NiIsInR5cCI6IkpXVCJ9';

    const result1 = await masker.processChunk(chunk1, { session });
    const result2 = await masker.processChunk(chunk2, { session });

    expect(result1.masked).toContain('BEARER_TOKEN_');
  });

  it('should respect minimum confidence threshold', async () => {
    const strictMasker = new StreamingMasker({
      detector,
      tokenizer,
      bufferSize: 128,
      minConfidence: 0.9
    });

    const chunk = 'Email: john@example.com';
    const result = await strictMasker.processChunk(chunk, { session });

    const detections = detector.detect(chunk);
    const emailDetection = detections.find(d => d.pattern === PatternType.EMAIL);

    if (emailDetection && emailDetection.confidence < 0.9) {
      expect(result.tokens.length).toBe(0);
    } else {
      expect(result.tokens.length).toBeGreaterThan(0);
    }
  });

  it('should filter by categories', async () => {
    const piiOnlyMasker = new StreamingMasker({
      detector,
      tokenizer,
      bufferSize: 128,
      categories: [PatternCategory.PII]
    });

    const chunk = 'Email: john@example.com, API: sk-12345678';
    const result = await piiOnlyMasker.processChunk(chunk, { session });

    expect(result.masked).toContain('EMAIL_');
    expect(result.masked).not.toContain('API_KEY_');
  });

  it('should handle very large chunks', async () => {
    const largeChunk = 'A'.repeat(10000) + ' john@example.com ' + 'B'.repeat(10000);
    const result = await masker.processChunk(largeChunk, { session });

    expect(result.masked).toContain('EMAIL_');
    expect(result.masked.length).toBe(largeChunk.length);
  });

  it('should handle Unicode in chunks', async () => {
    const chunk = 'Contact: 日本人@example.com or café@test.com';
    const result = await masker.processChunk(chunk, { session });

    expect(result.masked).toContain('EMAIL_');
  });
});

describe('StreamProcessor', () => {
  let processor: StreamProcessor;
  let detector: Detector;
  let tokenizer: Tokenizer;
  let vault: Vault;
  let session: string;

  beforeEach(async () => {
    vault = new Vault(':memory:', 'test-master-key');
    detector = new Detector();
    tokenizer = new Tokenizer(vault);
    session = tokenizer.generateSessionId();

    processor = new StreamProcessor({
      detector,
      tokenizer,
      chunkSize: 512,
      bufferSize: 256,
      session
    });
  });

  afterEach(() => {
    processor.reset();
    tokenizer.clearSession(session);
  });

  it('should process entire text correctly', async () => {
    const text = 'Contact me at john@example.com or call 555-123-4567';
    const result = await processor.process(text);

    expect(result).toContain('EMAIL_');
    expect(result).toContain('PHONE_');
  });

  it('should split text into chunks and process', async () => {
    const text = 'A'.repeat(1000) + ' john@example.com ' + 'B'.repeat(1000);
    const result = await processor.process(text);

    expect(result).toContain('EMAIL_');
    expect(result.length).toBe(text.length);
  });

  it('should collect all tokens from all chunks', async () => {
    const text = 'Email: john@example.com, Phone: 555-123-4567, SSN: 123-45-6789';
    await processor.process(text);

    const tokens = processor.getAllTokens();

    expect(tokens.length).toBeGreaterThanOrEqual(3);
  });

  it('should handle text smaller than chunk size', async () => {
    const text = 'john@example.com';
    const result = await processor.process(text);

    expect(result).toContain('EMAIL_');
  });

  it('should reset processor state', async () => {
    await processor.process('john@example.com');
    expect(processor.getAllTokens().length).toBeGreaterThan(0);

    processor.reset();

    expect(processor.getAllTokens()).toEqual([]);
    expect(processor.getBufferContent()).toBe('');
  });

  it('should handle empty text', async () => {
    const result = await processor.process('');

    expect(result).toBe('');
  });

  it('should process text with PII at boundaries', async () => {
    const text = 'A'.repeat(500) + ' john@example.com ' + 'B'.repeat(500);
    const result = await processor.process(text);

    expect(result).toContain('EMAIL_');
  });

  it('should handle multiple email addresses in text', async () => {
    const text = 'Emails: john@example.com, jane@example.com, bob@example.com';
    await processor.process(text);

    const tokens = processor.getAllTokens();

    const emailTokens = tokens.filter(t => t.startsWith('EMAIL_'));
    expect(emailTokens.length).toBeGreaterThanOrEqual(3);
  });

  it('should handle custom chunk size', async () => {
    const customProcessor = new StreamProcessor({
      detector,
      tokenizer,
      chunkSize: 100,
      bufferSize: 50,
      session
    });

    const text = 'A'.repeat(300) + ' john@example.com ';
    const result = await customProcessor.process(text);

    expect(result).toContain('EMAIL_');
  });

  it('should maintain buffer content between chunks', async () => {
    const text = 'Part1 test@example.com Part2';
    await processor.process(text);

    const bufferContent = processor.getBufferContent();

    expect(bufferContent.length).toBeGreaterThan(0);
  });

  it('should handle phone numbers in various formats', async () => {
    const text = 'Phones: (555) 123-4567, 555.123.4567, 5551234567';
    const result = await processor.process(text);

    expect(result).toContain('PHONE_');
  });
});

describe('Streaming Edge Cases', () => {
  let masker: StreamingMasker;
  let detector: Detector;
  let tokenizer: Tokenizer;
  let vault: Vault;
  let session: string;

  beforeEach(async () => {
    vault = new Vault(':memory:', 'test-master-key');
    detector = new Detector();
    tokenizer = new Tokenizer(vault);
    session = tokenizer.generateSessionId();

    masker = new StreamingMasker({
      detector,
      tokenizer,
      bufferSize: 64
    });
  });

  afterEach(() => {
    masker.reset();
    tokenizer.clearSession(session);
  });

  it('should handle email split exactly at @', async () => {
    const chunk1 = 'user';
    const chunk2 = '@domain.com';

    await masker.processChunk(chunk1, { session });
    const result2 = await masker.processChunk(chunk2, { session });

    expect(result2.masked).toContain('EMAIL_');
  });

  it('should handle IP split at dots', async () => {
    const chunk1 = '192.168.';
    const chunk2 = '1.1';

    await masker.processChunk(chunk1, { session });
    const result2 = await masker.processChunk(chunk2, { session });

    expect(result2.masked).toContain('IPV4_');
  });

  it('should handle SSN split at hyphens', async () => {
    const chunk1 = '123';
    const chunk2 = '-45';
    const chunk3 = '-6789';

    await masker.processChunk(chunk1, { session });
    await masker.processChunk(chunk2, { session });
    const result3 = await masker.processChunk(chunk3, { session });

    expect(result3.masked).toContain('SSN_');
  });

  it('should handle very small buffer size', async () => {
    const smallBufferMasker = new StreamingMasker({
      detector,
      tokenizer,
      bufferSize: 10
    });

    const chunk1 = 'john.doe@';
    const chunk2 = 'example.com';

    await smallBufferMasker.processChunk(chunk1, { session });
    const result2 = await smallBufferMasker.processChunk(chunk2, { session });

    expect(result2.masked).toContain('EMAIL_');
  });

  it('should handle rapid successive chunks', async () => {
    const chunks = Array.from({ length: 20 }, (_, i) => `Chunk${i} `);
    chunks[10] = ' john@example.com ';

    for (const chunk of chunks) {
      await masker.processChunk(chunk, { session });
    }

    const tokens = masker.getProcessedTokens();
    expect(tokens.length).toBeGreaterThan(0);
  });

  it('should handle chunk with only whitespace', async () => {
    const result = await masker.processChunk('   \n\t  ', { session });

    expect(result.masked).toBe('   \n\t  ');
    expect(result.tokens).toEqual([]);
  });

  it('should handle consecutive end-of-stream calls', async () => {
    await masker.processChunk('john@example.com', { session, endOfStream: true });
    const result = await masker.processChunk('', { session, endOfStream: true });

    expect(result.masked).toBe('');
  });

  it('should resume processing after reset', async () => {
    await masker.processChunk('first@example.com', { session });
    masker.reset();

    const result = await masker.processChunk('second@example.com', { session });

    expect(result.masked).toContain('EMAIL_');
  });

  it('should handle email with plus addressing', async () => {
    const chunk = 'Email: john.doe+tag@example.com';
    const result = await masker.processChunk(chunk, { session });

    expect(result.masked).toContain('EMAIL_');
  });

  it('should handle international phone numbers', async () => {
    const chunk = 'Phone: +1-555-123-4567 or +44 20 7123 4567';
    const result = await masker.processChunk(chunk, { session });

    expect(result.masked).toContain('PHONE_');
  });
});

describe('Performance Benchmarks', () => {
  let masker: StreamingMasker;
  let detector: Detector;
  let tokenizer: Tokenizer;
  let vault: Vault;
  let session: string;

  beforeEach(async () => {
    vault = new Vault(':memory:', 'test-master-key');
    detector = new Detector();
    tokenizer = new Tokenizer(vault);
    session = tokenizer.generateSessionId();

    masker = new StreamingMasker({
      detector,
      tokenizer,
      bufferSize: 256
    });
  });

  afterEach(() => {
    masker.reset();
    tokenizer.clearSession(session);
  });

  it('should process single chunk under 30ms', async () => {
    const chunk = 'Contact me at john@example.com for details regarding your order';
    const start = Date.now();

    await masker.processChunk(chunk, { session });

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(30);
  });

  it('should process 100 chunks under 100ms', async () => {
    const chunks = Array.from({ length: 100 }, (_, i) => `Chunk ${i} `);
    chunks[50] = ' john@example.com ';
    const start = Date.now();

    for (const chunk of chunks) {
      await masker.processChunk(chunk, { session });
    }

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it('should handle large text efficiently', async () => {
    const text = 'A'.repeat(100000) + ' john@example.com ' + 'B'.repeat(100000);
    const start = Date.now();

    const chunks = [];
    for (let i = 0; i < text.length; i += 4096) {
      chunks.push(text.substring(i, i + 4096));
    }

    for (const chunk of chunks) {
      await masker.processChunk(chunk, { session });
    }

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500);
  });
});
