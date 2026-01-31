import { DetectionResult, Pattern, PatternCategory } from './types.js';
import { getPatterns, allPatterns } from './patterns/index.js';

export interface DetectorOptions {
  categories?: PatternCategory[];
  minConfidence?: number;
}

export class Detector {
  private patterns: Pattern[];
  private minConfidence: number;

  constructor(options?: DetectorOptions) {
    this.patterns = options?.categories
      ? getPatterns().filter((p) => options.categories!.includes(p.category))
      : allPatterns;
    
    this.minConfidence = options?.minConfidence ?? 0;
  }

  detect(text: string): DetectionResult[] {
    const results: DetectionResult[] = [];
    const seen = new Set<string>();

    for (const pattern of this.patterns) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
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
  }
}
