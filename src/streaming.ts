import { Detector } from './detector.js';
import { Tokenizer, Token, SessionId } from './tokenizer.js';
import { PatternCategory, DetectionResult } from './types.js';

export interface StreamingMaskerOptions {
  detector: Detector;
  tokenizer: Tokenizer;
  bufferSize?: number;
  categories?: PatternCategory[];
  minConfidence?: number;
}

export interface ChunkResult {
  masked: string;
  tokens: Token[];
  pending: boolean;
}

export interface StreamOptions {
  session: SessionId;
  endOfStream?: boolean;
}

export class StreamingMasker {
  private detector: Detector;
  private tokenizer: Tokenizer;
  private buffer: string;
  private bufferSize: number;
  private processedTokens: Set<Token>;

  constructor(options: StreamingMaskerOptions) {
    this.detector = options.detector;
    this.tokenizer = options.tokenizer;
    this.bufferSize = options.bufferSize ?? 256;
    this.buffer = '';
    this.processedTokens = new Set();
  }

  async processChunk(chunk: string, streamOptions: StreamOptions): Promise<ChunkResult> {
    const { session, endOfStream = false } = streamOptions;

    if (!chunk || chunk.length === 0) {
      return { masked: '', tokens: [], pending: !endOfStream };
    }

    const combined = this.buffer + chunk;
    const detections = this.detector.detect(combined);

    if (detections.length === 0) {
      this.updateBuffer(combined);
      return { masked: chunk, tokens: [], pending: !endOfStream };
    }

    const masked = await this.maskText(combined, detections, session);
    const offset = this.buffer.length;
    const resultChunk = masked.substring(offset);

    this.updateBufferForMasked(combined, masked);

    if (endOfStream) {
      this.flush();
    }

    return {
      masked: resultChunk,
      tokens: Array.from(this.processedTokens),
      pending: !endOfStream
    };
  }

  private async maskText(text: string, detections: DetectionResult[], session: SessionId): Promise<string> {
    if (detections.length === 0) {
      return text;
    }

    const segments: Array<{ start: number; end: number; text: string; token?: Token }> = [];
    let lastEnd = 0;

    for (const detection of detections) {
      if (detection.start > lastEnd) {
        segments.push({
          start: lastEnd,
          end: detection.start,
          text: text.substring(lastEnd, detection.start)
        });
      }

      const token = await this.tokenizer.tokenize(
        detection.match,
        detection.pattern,
        session
      );

      this.processedTokens.add(token);
      segments.push({
        start: detection.start,
        end: detection.end,
        text: text.substring(detection.start, detection.end),
        token
      });

      lastEnd = detection.end;
    }

    if (lastEnd < text.length) {
      segments.push({
        start: lastEnd,
        end: text.length,
        text: text.substring(lastEnd)
      });
    }

    segments.sort((a, b) => a.start - b.start);

    let result = '';
    let pos = 0;

    for (const segment of segments) {
      if (segment.start > pos) {
        result += text.substring(pos, segment.start);
      }

      if (segment.token) {
        result += segment.token;
      } else {
        result += segment.text;
      }

      pos = segment.end;
    }

    return result;
  }

  private updateBuffer(combined: string): void {
    if (combined.length <= this.bufferSize) {
      this.buffer = combined;
    } else {
      this.buffer = combined.substring(combined.length - this.bufferSize);
    }
  }

  private updateBufferForMasked(original: string, masked: string): void {
    const originalTail = original.substring(Math.max(0, original.length - this.bufferSize));
    const maskedTail = masked.substring(Math.max(0, masked.length - this.bufferSize));

    const tokenPattern = /[A-Z]+_[0-9a-f]{8}/g;
    const tokensInTail = maskedTail.match(tokenPattern);

    if (tokensInTail && tokensInTail.length > 0) {
      this.buffer = maskedTail;
    } else {
      this.buffer = originalTail;
    }
  }

  flush(): void {
    this.buffer = '';
    this.processedTokens.clear();
  }

  getBuffer(): string {
    return this.buffer;
  }

  getProcessedTokens(): Token[] {
    return Array.from(this.processedTokens);
  }

  reset(): void {
    this.flush();
  }
}

export class ChunkBuffer {
  private buffer: string;
  private maxSize: number;

  constructor(maxSize: number = 1024) {
    this.buffer = '';
    this.maxSize = maxSize;
  }

  append(chunk: string): string {
    if (!chunk || chunk.length === 0) {
      return this.buffer;
    }

    const combined = this.buffer + chunk;

    if (combined.length <= this.maxSize) {
      this.buffer = combined;
    } else {
      this.buffer = combined.substring(combined.length - this.maxSize);
    }

    return this.buffer;
  }

  getTail(size: number): string {
    if (this.buffer.length <= size) {
      return this.buffer;
    }

    return this.buffer.substring(this.buffer.length - size);
  }

  clear(): void {
    this.buffer = '';
  }

  getBuffer(): string {
    return this.buffer;
  }

  getLength(): number {
    return this.buffer.length;
  }

  isEmpty(): boolean {
    return this.buffer.length === 0;
  }
}

export interface StreamProcessorOptions {
  detector: Detector;
  tokenizer: Tokenizer;
  chunkSize?: number;
  bufferSize?: number;
  session: SessionId;
}

export class StreamProcessor {
  private detector: Detector;
  private tokenizer: Tokenizer;
  private chunkSize: number;
  private buffer: ChunkBuffer;
  private masker: StreamingMasker;
  private session: SessionId;
  private allTokens: Set<Token>;

  constructor(options: StreamProcessorOptions) {
    this.detector = options.detector;
    this.tokenizer = options.tokenizer;
    this.chunkSize = options.chunkSize ?? 4096;
    this.buffer = new ChunkBuffer(options.bufferSize ?? 512);
    this.masker = new StreamingMasker({
      detector: this.detector,
      tokenizer: this.tokenizer,
      bufferSize: options.bufferSize ?? 512
    });
    this.session = options.session;
    this.allTokens = new Set();
  }

  async process(text: string): Promise<string> {
    if (!text || text.length === 0) {
      return '';
    }

    const chunks = this.splitIntoChunks(text, this.chunkSize);
    const results: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const isLastChunk = i === chunks.length - 1;

      this.buffer.append(chunk);
      const bufferedText = this.buffer.getBuffer();

      const result = await this.masker.processChunk(
        bufferedText,
        {
          session: this.session,
          endOfStream: isLastChunk
        }
      );

      result.tokens.forEach(token => this.allTokens.add(token));

      if (isLastChunk) {
        results.push(result.masked);
      } else {
        const chunkOffset = bufferedText.length - chunk.length;
        const maskedChunk = result.masked.substring(Math.max(0, chunkOffset));
        results.push(maskedChunk);
      }
    }

    return results.join('');
  }

  private splitIntoChunks(text: string, size: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += size) {
      chunks.push(text.substring(i, i + size));
    }
    return chunks;
  }

  getAllTokens(): Token[] {
    return Array.from(this.allTokens);
  }

  reset(): void {
    this.buffer.clear();
    this.masker.reset();
    this.allTokens.clear();
  }

  getBufferContent(): string {
    return this.buffer.getBuffer();
  }
}
