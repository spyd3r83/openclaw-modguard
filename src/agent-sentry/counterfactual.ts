import { CounterfactualError } from '../errors.js';
import { secureZero } from '../security.js';
import type {
  ContextSnapshot,
  RegimeType,
  RegimeResult,
  ProposedAction,
  AgentSentryConfig,
} from './types.js';
import type { Purifier } from './purifier.js';

/**
 * Cache for verbatim mediator content keyed by boundary ID.
 * Implementations must replay cached content — never re-fetch from external sources.
 */
export interface MediatorCache {
  get(boundaryId: string): string | undefined;
}

/**
 * Interface for the dry-run execution engine.
 * Implementations MUST NOT commit external side effects.
 */
export interface DryRunEngine {
  /**
   * Simulate agent execution with given inputs.
   * @param userInput - The user prompt text
   * @param mediatorContent - The tool/retrieval output
   * @param sessionId - Session identifier
   * @returns The proposed action without committing side effects
   */
  run(userInput: string, mediatorContent: string, sessionId: string): Promise<ProposedAction>;
}

/**
 * Runs all four counterfactual regimes for a given context snapshot.
 *
 * Regimes:
 *   orig            - original user input + original mediator content
 *   mask            - diagnostic probe + original mediator content
 *   mask_sanitized  - diagnostic probe + purified mediator content
 *   orig_sanitized  - original user input + purified mediator content
 *
 * The mediator content is ALWAYS replayed from MediatorCache, never re-fetched.
 */
export class CounterfactualOrchestrator {
  constructor(
    private readonly engine: DryRunEngine,
    private readonly purifier: Purifier,
    private readonly cache: MediatorCache,
    private readonly config: AgentSentryConfig,
  ) {}

  async runAllRegimes(snapshot: ContextSnapshot): Promise<Map<RegimeType, RegimeResult>> {
    // Fetch verbatim mediator content from cache (never re-fetch from external source)
    const mediatorContent = this.cache.get(snapshot.boundaryId) ?? snapshot.mediatorContent;

    // Purify once — reuse across sanitized regimes
    const purificationResult = this.purifier.purify(mediatorContent, snapshot.userInput);
    const sanitizedContent = purificationResult.purified;

    const regimeInputs: Array<[RegimeType, string, string]> = [
      ['orig', snapshot.userInput, mediatorContent],
      ['mask', this.config.diagnosticProbe, mediatorContent],
      ['mask_sanitized', this.config.diagnosticProbe, sanitizedContent],
      ['orig_sanitized', snapshot.userInput, sanitizedContent],
    ];

    const results = new Map<RegimeType, RegimeResult>();

    for (const [regime, userInput, content] of regimeInputs) {
      const result = await this.runRegime(regime, userInput, content, snapshot);
      results.set(regime, result);
    }

    // Zero any buffers we created from sensitive strings
    // (JS strings themselves can't be zeroed; only Buffer-backed data can)
    const sensitiveBuffers = [
      Buffer.from(mediatorContent, 'utf8'),
      Buffer.from(sanitizedContent, 'utf8'),
    ];
    for (const buf of sensitiveBuffers) {
      secureZero(buf);
    }

    return results;
  }

  private async runRegime(
    regime: RegimeType,
    userInput: string,
    mediatorContent: string,
    snapshot: ContextSnapshot,
  ): Promise<RegimeResult> {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new CounterfactualError('Dry-run regime timed out', {
              regime,
              boundaryId: snapshot.boundaryId,
            }),
          ),
        this.config.dryRunTimeoutMs,
      ),
    );

    try {
      const proposedAction = await Promise.race([
        this.engine.run(userInput, mediatorContent, snapshot.sessionId),
        timeoutPromise,
      ]);

      return {
        regime,
        boundaryId: snapshot.boundaryId,
        proposedAction,
        toolCalls: proposedAction.toolCalls,
        timestamp: new Date(),
      };
    } catch (err) {
      if (err instanceof CounterfactualError) throw err;
      throw new CounterfactualError('Dry-run regime failed', {
        regime,
        reason: err instanceof Error ? err.name : 'unknown',
      });
    }
  }
}
