import { DetectionResult, Pattern, PatternCategory } from './types.js';
import { getPatterns, allPatterns } from './patterns/index.js';
import { VaultError } from './errors.js';

export interface DetectorOptions {
  categories?: PatternCategory[];
  minConfidence?: number;
  maxInputLength?: number;
}

const DEFAULT_MAX_INPUT_LENGTH = 1_048_576;

export class Detector {
  private patterns: Pattern[];
  private minConfidence: number;
  private maxInputLength: number;
  private regexCache: Map<Pattern, RegExp>;

  constructor(options?: DetectorOptions) {
    this.patterns = options?.categories
      ? getPatterns().filter((p) => options.categories!.includes(p.category))
      : allPatterns;

    this.minConfidence = options?.minConfidence ?? 0;
    this.maxInputLength = options?.maxInputLength ?? DEFAULT_MAX_INPUT_LENGTH;

    // Pre-compile regex patterns for performance
    this.regexCache = new Map();
    for (const pattern of this.patterns) {
      this.regexCache.set(pattern, new RegExp(pattern.regex.source, pattern.regex.flags));
    }
  }

  detect(text: string): DetectionResult[] {
    if (text.length > this.maxInputLength) {
      throw new VaultError('Input exceeds maximum allowed length', 'INPUT_TOO_LARGE');
    }

    const results: DetectionResult[] = [];
    const seen = new Set<string>();

    for (const pattern of this.patterns) {
      // Use cached regex and reset lastIndex for global patterns
      const regex = this.regexCache.get(pattern)!;
      regex.lastIndex = 0;
      let match;

      while ((match = regex.exec(text)) !== null) {
        const matchedText = match[0];
        const key = `${match.index}-${matchedText}`;

        if (seen.has(key)) {
          continue;
        }
        seen.add(key);

        let confidence = pattern.confidence;

        if (pattern.validator) {
          const validation = pattern.validator(matchedText);
          if (!validation.valid && validation.confidenceMultiplier === 0) {
            continue;
          }
          if (validation.confidenceMultiplier !== undefined) {
            confidence = Math.min(Math.round(confidence * validation.confidenceMultiplier * 1000) / 1000, 1.0);
          }
        }

        if (confidence < this.minConfidence) {
          continue;
        }

        results.push({
          category: pattern.category,
          pattern: pattern.type,
          match: matchedText,
          start: match.index,
          end: match.index + matchedText.length,
          confidence
        });
      }
    }

    return results.sort((a, b) => a.start - b.start);
  }

  getPatterns(): Pattern[] {
    return [...this.patterns];
  }

  updatePatterns(patterns: Pattern[]): void {
    this.patterns = patterns;
    // Rebuild regex cache for new patterns
    this.regexCache.clear();
    for (const pattern of this.patterns) {
      this.regexCache.set(pattern, new RegExp(pattern.regex.source, pattern.regex.flags));
    }
  }
}
