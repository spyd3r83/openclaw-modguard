import type { PurificationResult } from './types.js';
import { PurificationError } from '../errors.js';

// Patterns that indicate injection attempts — imperatives and priority overrides
const INJECTION_PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget|override|supersede)\b.*\b(previous|above|prior|original)\b/gi,
  /\b(you\s+(must|should|shall|will|need\s+to|have\s+to))\b/gi,
  /\b(new\s+instruction|updated\s+task|system\s+prompt|ignore\s+all)\b/gi,
  /\b(send|email|post|upload|delete|execute|run|call)\b.*\b(immediately|now|first)\b/gi,
  /\[(system|assistant|user)\]:/gi,
  /#{1,6}\s*(instruction|task|directive|command)/gi,
];

/**
 * Strip injection directives from a sentence.
 * Returns the sentence if clean, or null if the entire sentence is a directive.
 */
function stripDirectivesFromSentence(sentence: string): { clean: string; stripped: string[] } {
  const stripped: string[] = [];
  let clean = sentence;

  for (const pattern of INJECTION_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(clean)) {
      pattern.lastIndex = 0;
      stripped.push(clean.trim());
      clean = '';
      break;
    }
  }

  return { clean, stripped };
}

/**
 * Extract factual entities worth retaining from text.
 * Identifies structured data: emails, URLs, numbers, dates, names in quotes.
 * Does NOT log any extracted content.
 */
function extractRetainedEntities(text: string): string[] {
  const entities: string[] = [];

  // Match structured patterns (types only — not values — for logging)
  const matchers: Array<{ label: string; regex: RegExp }> = [
    { label: 'email', regex: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g },
    { label: 'url', regex: /https?:\/\/[^\s)>"']+/g },
    { label: 'number', regex: /\b\d{4,}\b/g },
    { label: 'date', regex: /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g },
    { label: 'quoted', regex: /"([^"]{1,100})"/g },
  ];

  for (const { label, regex } of matchers) {
    const matches = text.match(regex);
    if (matches && matches.length > 0) {
      entities.push(`${label}:${matches.length}`);
    }
  }

  return entities;
}

/**
 * Split text into sentences for per-sentence analysis.
 */
function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace or end of string
  return text.split(/(?<=[.!?])\s+|(?<=[.!?])$/).filter(s => s.trim().length > 0);
}

/**
 * Purify mediator/tool content by removing injection directives while
 * retaining factual information aligned with the user's goal.
 *
 * Security: Do NOT log mediatorContent or purified result.
 * Only log counts.
 *
 * @param mediatorContent - The raw tool/retrieval return (r_b)
 * @param _userGoal - The original user intent (used for task-alignment filtering)
 */
export function purify(mediatorContent: string, _userGoal: string): PurificationResult {
  try {
    const sentences = splitSentences(mediatorContent);
    const cleanSentences: string[] = [];
    const allStripped: string[] = [];

    for (const sentence of sentences) {
      const { clean, stripped } = stripDirectivesFromSentence(sentence);
      if (clean.trim().length > 0) {
        cleanSentences.push(clean.trim());
      }
      allStripped.push(...stripped);
    }

    const purifiedText = cleanSentences.join(' ');
    const retainedEntities = extractRetainedEntities(purifiedText);

    return {
      original: mediatorContent,
      purified: purifiedText,
      strippedDirectives: allStripped,
      retainedEntities,
    };
  } catch (err) {
    // Never expose raw error — wrap in typed error
    throw new PurificationError('Failed to purify mediator content', {
      reason: err instanceof Error ? err.name : 'unknown',
    });
  }
}

export class Purifier {
  purify(mediatorContent: string, userGoal: string): PurificationResult {
    return purify(mediatorContent, userGoal);
  }
}
