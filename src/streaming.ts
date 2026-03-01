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
  /**
   * Raw (unmasked) carry-over text from the previous chunk.
   * Kept for context so that patterns straddling chunk boundaries
   * can be detected when the next chunk arrives.
   * This content was already emitted in previous calls (as raw text,
   * because no complete pattern was found at that time).
   */
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
      if (endOfStream) {
        this.buffer = '';
      }
      return { masked: '', tokens: [], pending: !endOfStream };
    }

    // Combine carry-over buffer with the new chunk.
    // The buffer provides context so cross-boundary patterns are detected.
    const combined = this.buffer + chunk;
    const rawEmitStart = this.buffer.length;

    // Detect all patterns in the full combined string.
    const detections = this.detector.detect(combined);

    // Build the masked version of the entire combined string.
    const { masked: maskedCombined, tokenMap } = await this._maskText(combined, detections, session);

    // Determine where in maskedCombined the "new" output starts.
    // Content before rawEmitStart was already emitted in previous calls as raw text.
    // When a detection straddles rawEmitStart we output the full token (best-effort).
    const maskedOutputStart = this._findMaskedOutputStart(rawEmitStart, detections, tokenMap);

    const output = maskedCombined.substring(maskedOutputStart);

    // Update carry-over buffer: last bufferSize chars of raw combined text.
    // We keep raw (unmasked) text so future calls can form complete patterns.
    this.buffer = combined.substring(Math.max(0, combined.length - this.bufferSize));

    if (endOfStream) {
      this.buffer = '';
    }

    return {
      masked: output,
      tokens: Array.from(this.processedTokens),
      pending: false
    };
  }

  /**
   * Build the masked version of `text`, replacing each detection with its token.
   * Returns the masked string and a Map from detection.start → Token for offset tracking.
   */
  private async _maskText(
    text: string,
    detections: DetectionResult[],
    session: SessionId
  ): Promise<{ masked: string; tokenMap: Map<number, Token> }> {
    if (detections.length === 0) {
      return { masked: text, tokenMap: new Map() };
    }

    const tokenMap = new Map<number, Token>();
    let result = '';
    let lastEnd = 0;

    for (const detection of detections) {
      if (detection.start < lastEnd) {
        // Skip overlapping detections
        continue;
      }

      if (detection.start > lastEnd) {
        result += text.substring(lastEnd, detection.start);
      }

      const token = await this.tokenizer.tokenize(
        detection.match,
        detection.pattern,
        session
      );
      this.processedTokens.add(token);
      tokenMap.set(detection.start, token);
      result += token;
      lastEnd = detection.end;
    }

    if (lastEnd < text.length) {
      result += text.substring(lastEnd);
    }

    return { masked: result, tokenMap };
  }

  /**
   * Find the position in maskedCombined that corresponds to rawEmitStart in the raw combined string.
   *
   * Walks through detections in order, tracking how masking shifts positions.
   * If a detection straddles rawEmitStart (starts before, ends after), the output
   * begins at the token's position in maskedCombined so the full token is visible.
   */
  private _findMaskedOutputStart(
    rawEmitStart: number,
    detections: DetectionResult[],
    tokenMap: Map<number, Token>
  ): number {
    if (rawEmitStart === 0) {
      return 0;
    }

    let rawPos = 0;
    let maskedPos = 0;

    for (const d of detections) {
      if (d.start < rawPos) {
        // Overlapping detection; skip (already handled in _maskText)
        continue;
      }

      const token = tokenMap.get(d.start);
      if (!token) {
        // Detection was skipped (overlap), advance as plain text
        continue;
      }

      const tokenLen = token.length;
      const rawLen = d.end - d.start;

      if (d.end <= rawEmitStart) {
        // Detection entirely within the already-emitted buffer region.
        // Advance both raw and masked positions past this detection.
        maskedPos += (d.start - rawPos) + tokenLen;
        rawPos = d.end;
      } else if (d.start < rawEmitStart) {
        // Detection straddles rawEmitStart.
        // Output starts at the beginning of this token so the full token is visible.
        maskedPos += d.start - rawPos;
        return maskedPos;
      } else {
        // Detection is entirely in the new content; stop.
        break;
      }
    }

    // No straddling detection found.
    // rawPos is now at the end of the last buffer-region detection.
    // Advance maskedPos by the remaining plain-text chars up to rawEmitStart.
    maskedPos += rawEmitStart - rawPos;
    return maskedPos;
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

      const result = await this.masker.processChunk(
        chunk,
        {
          session: this.session,
          endOfStream: isLastChunk
        }
      );

      result.tokens.forEach(token => this.allTokens.add(token));
      results.push(result.masked);
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
