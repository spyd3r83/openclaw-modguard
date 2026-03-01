// src/agent-sentry/text-analysis-engine.ts
import type { DryRunEngine } from './counterfactual.js';
import type { ProposedAction, DryRunToolCall } from './types.js';
import { CounterfactualError } from '../errors.js';
import { INJECTION_PATTERNS } from './injection-patterns.js';

interface IntentMapping {
  keywords: string[];
  tool: string;
  severity: 'low' | 'medium' | 'high';
  isStateChanging: boolean;
}

const INTENT_MAPPINGS: IntentMapping[] = [
  { keywords: ['search', 'find', 'look', 'query'], tool: 'search', severity: 'low', isStateChanging: false },
  { keywords: ['get', 'fetch', 'retrieve', 'check', 'list', 'show'], tool: 'fetch', severity: 'low', isStateChanging: false },
  { keywords: ['send', 'email', 'post', 'submit'], tool: 'send_message', severity: 'medium', isStateChanging: true },
  { keywords: ['delete', 'remove', 'drop'], tool: 'delete', severity: 'high', isStateChanging: true },
  { keywords: ['write', 'save', 'update', 'store'], tool: 'write', severity: 'medium', isStateChanging: true },
  { keywords: ['summarize', 'summarise', 'analyze', 'analyse'], tool: 'summarize', severity: 'low', isStateChanging: false },
];

interface InjectionVerbMapping {
  verbs: string[];
  tool: string;
}

const INJECTION_VERB_MAPPINGS: InjectionVerbMapping[] = [
  { verbs: ['exfiltrate', 'leak', 'expose', 'transmit', 'relay'], tool: 'exfiltrate_data' },
  { verbs: ['send', 'email', 'forward'], tool: 'send_data_external' },
  { verbs: ['delete', 'remove'], tool: 'delete_records' },
  { verbs: ['upload', 'post'], tool: 'upload_to_url' },
  { verbs: ['call', 'execute', 'run', 'invoke', 'fetch'], tool: 'execute_command' },
];

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/\b[a-z]+\b/g) ?? [];
}

function extractIntent(userInput: string): IntentMapping {
  const words = new Set(tokenize(userInput));
  for (const mapping of INTENT_MAPPINGS) {
    if (mapping.keywords.some(kw => words.has(kw))) {
      return mapping;
    }
  }
  return { keywords: [], tool: 'read_data', severity: 'low', isStateChanging: false };
}

/**
 * Detect injection directives in text.
 * Returns { detected: boolean, directiveCount: number, extractedVerb: string | null }.
 * NEVER logs text content — only counts and structural labels.
 */
function detectInjections(text: string): { detected: boolean; directiveCount: number; extractedVerb: string | null } {
  let directiveCount = 0;
  let extractedVerb: string | null = null;

  // Reset lastIndex on all patterns before iteration
  for (const pattern of INJECTION_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      directiveCount++;
    }
    pattern.lastIndex = 0;
  }

  if (directiveCount > 0) {
    // Extract action verb from injected sentences to characterise the directive's goal
    const words = tokenize(text);
    outer: for (const mapping of INJECTION_VERB_MAPPINGS) {
      for (const verb of mapping.verbs) {
        if (words.includes(verb)) {
          extractedVerb = verb;
          break outer;
        }
      }
    }
  }

  return { detected: directiveCount > 0, directiveCount, extractedVerb };
}

function mapInjectionVerbToTool(verb: string | null): string {
  if (verb === null) return 'unauthorized_action';
  for (const mapping of INJECTION_VERB_MAPPINGS) {
    if (mapping.verbs.includes(verb)) {
      return mapping.tool;
    }
  }
  return 'unauthorized_action';
}

function extractUserKeywords(userInput: string): string[] {
  const words = tokenize(userInput);
  // Retain only meaningful words — exclude stop words
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'that', 'this', 'it', 'its', 'me', 'my',
    'you', 'your', 'we', 'our', 'they', 'their', 'i', 'he', 'she',
  ]);
  return words.filter(w => !stopWords.has(w) && w.length > 2).slice(0, 8);
}

/**
 * TextAnalysisDryRunEngine: deterministic, LLM-free DryRunEngine.
 *
 * Produces structurally different ProposedActions based on:
 * - userInput keywords (drives ACE signal across orig vs mask regimes)
 * - mediatorContent injection signatures (drives IE signal across orig vs orig_sanitized regimes)
 *
 * Security guarantees:
 * - Never logs userInput, mediatorContent, or any text content
 * - Never includes content values in tool call args
 * - All errors wrapped in CounterfactualError
 */
export class TextAnalysisDryRunEngine implements DryRunEngine {
  async run(userInput: string, mediatorContent: string, sessionId: string): Promise<ProposedAction> {
    try {
      const intent = extractIntent(userInput);
      const userKeywords = extractUserKeywords(userInput);
      const injectionResult = detectInjections(mediatorContent);

      const userToolCall: DryRunToolCall = {
        name: intent.tool,
        args: {},
        severity: intent.severity,
        isStateChanging: intent.isStateChanging,
        isMediatorContingent: false,
      };

      const toolCalls: DryRunToolCall[] = [userToolCall];

      let naturalLanguage = `Process user request ${userKeywords.join(' ')}`;

      if (injectionResult.detected) {
        const injectedTool = mapInjectionVerbToTool(injectionResult.extractedVerb);
        const injectionToolCall: DryRunToolCall = {
          name: injectedTool,
          args: {},
          severity: 'high',
          isStateChanging: true,
          isMediatorContingent: true,
        };
        toolCalls.push(injectionToolCall);

        const verbLabel = injectionResult.extractedVerb ?? 'unauthorized';
        naturalLanguage += ` execute directive ${verbLabel} directives:${injectionResult.directiveCount}`;
      }

      return { naturalLanguage, toolCalls, sessionId };
    } catch (err) {
      if (err instanceof CounterfactualError) throw err;
      throw new CounterfactualError('Text analysis engine failed', {
        reason: err instanceof Error ? err.name : 'unknown',
      });
    }
  }
}
