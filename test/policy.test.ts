import { describe, it, expect } from 'vitest';
import { Policy, PolicyConfig, PolicyDecision, PolicyAction } from '../src/policy.js';
import { loadPolicy, validatePolicyConfig } from '../src/policy-loader.js';
import { PatternCategory, PatternType } from '../src/types.js';
import { PolicyError, InvalidPolicyConfigError, InvalidPolicyActionError, InvalidPolicyConditionError, InvalidPolicyConditionOperatorError } from '../src/errors.js';

describe('Policy', () => {
  describe('evaluate', () => {
    it('returns block action when first rule matches', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'block',
            priority: 100,
            conditions: [
              { type: 'category', operator: '==', value: 'pii' }
            ]
          }
        ]
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({
        category: PatternCategory.PII
      });

      expect(decision.action).toBe('block');
      expect(decision.matchedRule?.action).toBe('block');
    });

    it('returns mask action when second rule matches', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'block',
            priority: 100,
            conditions: [
              { type: 'category', operator: '==', value: 'credit_card' }
            ]
          },
          {
            action: 'mask',
            priority: 50,
            conditions: [
              { type: 'category', operator: '==', value: 'pii' }
            ]
          }
        ]
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({
        category: PatternCategory.PII
      });

      expect(decision.action).toBe('mask');
      expect(decision.matchedRule?.priority).toBe(50);
    });

    it('returns allow action when no rules match', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'block',
            priority: 100,
            conditions: [
              { type: 'category', operator: '==', value: 'credit_card' }
            ]
          }
        ],
        failClosed: false,
        defaultAction: 'allow'
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({
        category: PatternCategory.SECRETS
      });

      expect(decision.action).toBe('allow');
      expect(decision.content).toBe('');
    });

    it('returns block when no rules match and failClosed=true', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'block',
            priority: 100,
            conditions: [
              { type: 'category', operator: '==', value: 'credit_card' }
            ]
          }
        ],
        failClosed: true
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({
        category: PatternCategory.SECRETS
      });

      expect(decision.action).toBe('block');
      expect(decision.blockReason).toBeDefined();
      expect(decision.cancel).toBe(true);
    });

    it('evaluates all conditions with AND logic', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'block',
            priority: 100,
            conditions: [
              { type: 'category', operator: '==', value: 'pii' },
              { type: 'channel', operator: '==', value: 'telegram' }
            ]
          }
        ]
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({
        category: PatternCategory.PII,
        channel: 'telegram'
      });

      expect(decision.action).toBe('block');
    });

    it('respects priority ordering', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'allow',
            priority: 10,
            conditions: []
          },
          {
            action: 'block',
            priority: 50,
            conditions: []
          },
          {
            action: 'block',
            priority: 100,
            conditions: [
              { type: 'category', operator: '==', value: 'pii' }
            ]
          }
        ]
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({
        category: PatternCategory.PII
      });

      expect(decision.action).toBe('allow');
    });

    it('returns early when first rule matches', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'allow',
            priority: 100,
            conditions: []
          },
          {
            action: 'block',
            priority: 50,
            conditions: [
              { type: 'category', operator: '==', value: 'pii' }
            ]
          },
          {
            action: 'mask',
            priority: 10,
            conditions: [
              { type: 'category', operator: '==', value: 'secrets' }
            ]
          }
        ]
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({
        category: PatternCategory.PII
      });

      expect(decision.action).toBe('allow');
    });

    it('includes category in decision', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'block',
            priority: 100,
            conditions: [
              { type: 'category', operator: '==', value: 'pii' }
            ]
          }
        ]
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({
        category: PatternCategory.PII
      });

      expect(decision.category).toBe('pii');
    });

    it('includes confidence in decision when rule specifies it', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'block',
            priority: 100,
            conditions: [
              { type: 'category', operator: '==', value: 'pii' }
            ],
            confidence: 0.95
          }
        ]
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({
        category: PatternCategory.PII,
        confidence: 0.95
      });

      expect(decision.confidence).toBe(0.95);
    });

    it('handles missing context fields gracefully', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'allow',
            priority: 100,
            conditions: [
              { type: 'category', operator: '==', value: 'pii' }
            ]
          }
        ]
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({});

      expect(decision.action).toBe('allow');
      expect(decision.content).toBe('');
    });
  });

  describe('Category Condition', () => {
    it('matches exact category', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'block',
            priority: 100,
            conditions: [
              { type: 'category', operator: '==', value: 'pii' }
            ]
          }
        ]
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({ category: PatternCategory.PII });

      expect(decision.action).toBe('block');
    });

    it('matches wildcard category', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'block',
            priority: 100,
            conditions: [
              { type: 'category', operator: '==', value: '*' }
            ]
          }
        ]
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({ category: PatternCategory.SECRETS });

      expect(decision.action).toBe('block');
    });

    it('matches category in list', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'block',
            priority: 100,
            conditions: [
              { type: 'category', operator: '==', value: ['pii', 'secrets'] }
            ]
          }
        ]
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({ category: PatternCategory.PII });

      expect(decision.action).toBe('block');
    });

    it('does not match different category', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'block',
            priority: 100,
            conditions: [
              { type: 'category', operator: '==', value: 'pii' }
            ]
          }
        ]
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({ category: PatternCategory.SECRETS });

      expect(decision.action).not.toBe('block');
    });

    it('supports != operator', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'block',
            priority: 100,
            conditions: [
              { type: 'category', operator: '!=', value: 'pii' }
            ]
          }
        ]
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({ category: PatternCategory.PII });

      expect(decision.action).not.toBe('block');
    });
  });

  describe('Channel Condition', () => {
    it('matches exact channel', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'block',
            priority: 100,
            conditions: [
              { type: 'channel', operator: '==', value: 'telegram' }
            ]
          }
        ]
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({ channel: 'telegram' });

      expect(decision.action).toBe('block');
    });

    it('matches channel in list', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'block',
            priority: 100,
            conditions: [
              { type: 'channel', operator: '==', value: ['telegram', 'slack'] }
            ]
          }
        ]
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({ channel: 'telegram' });

      expect(decision.action).toBe('block');
    });

    it('supports wildcard channel', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'block',
            priority: 100,
            conditions: [
              { type: 'channel', operator: '==', value: '*' }
            ]
          }
        ]
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({ channel: 'slack' });

      expect(decision.action).toBe('block');
    });
  });

  describe('Direction Condition', () => {
    it('matches inbound direction', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'block',
            priority: 100,
            conditions: [
              { type: 'direction', operator: '==', value: 'inbound' }
            ]
          }
        ]
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({ direction: 'inbound' });

      expect(decision.action).toBe('block');
    });

    it('matches outbound direction', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'block',
            priority: 100,
            conditions: [
              { type: 'direction', operator: '==', value: 'outbound' }
            ]
          }
        ]
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({ direction: 'outbound' });

      expect(decision.action).toBe('block');
    });

    it('matches direction in list', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'block',
            priority: 100,
            conditions: [
              { type: 'direction', operator: '==', value: ['inbound', 'outbound'] }
            ]
          }
        ]
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({ direction: 'inbound' });

      expect(decision.action).toBe('block');
    });
  });

  describe('Confidence Threshold Condition', () => {
    it('matches with >= operator', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'block',
            priority: 100,
            conditions: [
              { type: 'confidence', operator: '>=', value: 0.9 }
            ]
          }
        ]
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({ confidence: 0.95 });

      expect(decision.action).toBe('block');
      expect(decision.confidence).toBe(0.95);
    });

    it('matches with > operator', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'block',
            priority: 100,
            conditions: [
              { type: 'confidence', operator: '>', value: 0.8 }
            ]
          }
        ]
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({ confidence: 0.95 });

      expect(decision.action).toBe('block');
    });

    it('matches with <= operator', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'allow',
            priority: 100,
            conditions: [
              { type: 'confidence', operator: '<=', value: 0.5 }
            ]
          }
        ]
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({ confidence: 0.4 });

      expect(decision.action).toBe('allow');
    });

    it('matches with < operator', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'allow',
            priority: 100,
            conditions: [
              { type: 'confidence', operator: '<', value: 0.7 }
            ]
          }
        ]
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({ confidence: 0.95 });

      expect(decision.action).toBe('allow');
    });

    it('matches with == operator', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'allow',
            priority: 100,
            conditions: [
              { type: 'confidence', operator: '==', value: 0.5 }
            ]
          }
        ]
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({ confidence: 0.5 });

      expect(decision.action).toBe('allow');
    });
  });

  describe('Priority Ordering', () => {
    it('sorts rules by priority', () => {
      const config: PolicyConfig = {
        rules: [
          { action: 'allow', priority: 10, conditions: [] },
          { action: 'block', priority: 50, conditions: [] },
          { action: 'mask', priority: 100, conditions: [] }
        ]
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({});

      expect(decision.action).toBe('allow');
    });

    it('evaluates higher priority rules first', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'allow',
            priority: 100,
            conditions: []
          },
          {
            action: 'block',
            priority: 50,
            conditions: [
              { type: 'category', operator: '==', value: 'pii' }
            ]
          },
          {
            action: 'mask',
            priority: 10,
            conditions: [
              { type: 'category', operator: '==', value: 'secrets' }
            ]
          }
        ]
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({ category: PatternCategory.PII });

      expect(decision.action).toBe('block');
      expect(decision.matchedRule?.priority).toBe(50);
    });
  });

  describe('failClosed Behavior', () => {
    it('blocks when failClosed=true and no rules match', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'block',
            priority: 100,
            conditions: [
              { type: 'category', operator: '==', value: 'pii' }
            ]
          }
        ],
        failClosed: true
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({ category: PatternCategory.SECRETS });

      expect(decision.action).toBe('block');
      expect(decision.blockReason).toBeDefined();
      expect(decision.cancel).toBe(true);
    });

    it('allows when failClosed=false and no rules match', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'block',
            priority: 100,
            conditions: [
              { type: 'category', operator: '==', value: 'pii' }
            ]
          }
        ],
        failClosed: false,
        defaultAction: 'allow'
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({ category: PatternCategory.SECRETS });

      expect(decision.action).toBe('allow');
      expect(decision.blockReason).toBeUndefined();
      expect(decision.cancel).toBeUndefined();
    });

    it('allows when failClosed=false with custom defaultAction', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'block',
            priority: 100,
            conditions: [
              { type: 'category', operator: '==', value: 'pii' }
            ]
          }
        ],
        failClosed: false,
        defaultAction: 'mask'
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({ category: PatternCategory.SECRETS });

      expect(decision.action).toBe('mask');
      expect(decision.content).toBe('');
    });
  });

  describe('updateRules', () => {
    it('updates rules and reorders by priority', () => {
      const policy = loadPolicy({
        rules: [
          { action: 'allow', priority: 10, conditions: [] },
          { action: 'block', priority: 50, conditions: [] }
        ]
      });

      policy.updateRules([
        { action: 'mask', priority: 100, conditions: [] },
        { action: 'block', priority: 10, conditions: [] }
      ]);

      const decision = policy.evaluate({});

      expect(decision.action).toBe('mask');
    });
  });

  describe('findFirstMatchingRule', () => {
    it('returns first matching rule', () => {
      const policy = loadPolicy({
        rules: [
          { action: 'allow', priority: 50, conditions: [] },
          { action: 'block', priority: 100, conditions: [{ type: 'category', operator: '==', value: 'pii' }] },
          { action: 'mask', priority: 75, conditions: [{ type: 'category', operator: '==', value: 'pii' }] }
        ]
      });

      const rule = policy.findFirstMatchingRule({ category: PatternCategory.PII });

      expect(rule?.action).toBe('block');
      expect(rule?.priority).toBe(100);
    });

    it('returns null when no rule matches', () => {
      const policy = loadPolicy({
        rules: [
          { action: 'block', priority: 100, conditions: [{ type: 'category', operator: '==', value: 'pii' }] }
        ]
      });

      const rule = policy.findFirstMatchingRule({ category: PatternCategory.SECRETS });

      expect(rule).toBeNull();
    });
  });

  describe('Policy Config Validation', () => {
    describe('loadPolicy', () => {
      it('throws error for null config', () => {
        expect(() => loadPolicy(null as unknown)).toThrow(InvalidPolicyConfigError);
      });

      it('throws error for non-object config', () => {
        expect(() => loadPolicy('invalid')).toThrow(InvalidPolicyConfigError);
      });

      it('throws error for missing rules', () => {
        expect(() => loadPolicy({ rules: [] })).toThrow(InvalidPolicyConfigError);
      });

      it('throws error for non-array rules', () => {
        expect(() => loadPolicy({ rules: 'invalid' as unknown })).toThrow(InvalidPolicyConfigError);
      });

      it('throws error for non-object rule', () => {
        expect(() => loadPolicy({ rules: ['invalid'] })).toThrow(InvalidPolicyConfigError);
      });

      it('throws error for invalid action', () => {
        const invalidAction = 'invalid' as PolicyAction;
        const config = {
          rules: [{ action: invalidAction, priority: 100, conditions: [] }]
        };
        expect(() => loadPolicy(config)).toThrow(InvalidPolicyActionError);
      });

      it('throws error for invalid priority', () => {
        const config = {
          rules: [{ action: 'block' as PolicyAction, priority: -1, conditions: [] }]
        };
        expect(() => loadPolicy(config)).toThrow(InvalidPolicyConfigError);
      });

      it('throws error for non-array conditions', () => {
        const conditions = 'invalid' as unknown;
        const config = {
          rules: [{ action: 'block' as PolicyAction, priority: 100, conditions: [conditions] }]
        };
        expect(() => loadPolicy(config)).toThrow(InvalidPolicyConfigError);
      });

      it('throws error for non-object condition', () => {
        const config = {
          rules: [{ action: 'block' as PolicyAction, priority: 100, conditions: ['invalid'] }]
        };
        expect(() => loadPolicy(config)).toThrow(InvalidPolicyConfigError);
      });

      it('throws error for invalid condition type', () => {
        const config = {
          rules: [{ action: 'block' as PolicyAction, priority: 100, conditions: [{ type: 'invalid' as unknown, operator: '==', value: 'pii' }] }
        };
        expect(() => loadPolicy(config)).toThrow(InvalidPolicyConditionError);
      });

      it('throws error for invalid operator', () => {
        const config = {
          rules: [{ action: 'block' as PolicyAction, priority: 100, conditions: [{ type: 'category' as unknown, operator: 'invalid' as unknown, value: 'pii' }] }
        };
        expect(() => loadPolicy(config)).toThrow(InvalidPolicyConditionOperatorError);
      });

      it('throws error for invalid failClosed type', () => {
        const config = {
          rules: [{ action: 'block' as PolicyAction, priority: 100, conditions: [] }],
          failClosed: 'invalid' as unknown
        };
        expect(() => loadPolicy(config)).toThrow(InvalidPolicyConfigError);
      });

      it('throws error for invalid defaultAction', () => {
        const config = {
          rules: [{ action: 'block' as PolicyAction, priority: 100, conditions: [] }],
          defaultAction: 'invalid' as unknown
        };
        expect(() => loadPolicy(config)).toThrow(InvalidPolicyConfigError);
      });

      it('accepts valid config', () => {
        const config = {
          rules: [
            { action: 'block' as PolicyAction, priority: 100, conditions: [] }
          ],
          failClosed: true,
          defaultAction: 'allow'
        };

        expect(() => loadPolicy(config)).not.toThrow();
      });
    });
  });

  describe('Error Handling', () => {
    it('PolicyError has correct code', () => {
      const error = new PolicyError('Test error', 'TEST_CODE', { context: 'test' });

      expect(error.code).toBe('TEST_CODE');
      expect(error.name).toBe('PolicyError');
      expect(error.context).toEqual({ context: 'test' });
    });

    it('InvalidPolicyActionError includes action in context', () => {
      const error = new InvalidPolicyActionError('Invalid action', { action: 'invalid' });

      expect(error.code).toBe('INVALID_ACTION');
      expect(error.context).toEqual({ action: 'invalid' });
    });

    it('InvalidPolicyConditionError includes condition in context', () => {
      const error = new InvalidPolicyConditionError('Invalid condition', { condition: { type: 'invalid' as unknown, operator: '==', value: 'pii' } });

      expect(error.code).toBe('INVALID_CONDITION');
      expect(error.context).toEqual({ condition: { type: 'invalid', operator: '==', value: 'pii' } });
    });

    it('InvalidPolicyConditionOperatorError includes operator in context', () => {
      const error = new InvalidPolicyConditionOperatorError('Invalid operator', { operator: 'invalid' });

      expect(error.code).toBe('INVALID_OPERATOR');
      expect(error.context).toEqual({ operator: 'invalid' });
    });
  });

  describe('Edge Cases', () => {
    it('handles rules with no conditions', () => {
      const config: PolicyConfig = {
        rules: [
          { action: 'allow', priority: 100, conditions: [] },
          { action: 'block', priority: 50, conditions: [] }
        ]
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({});

      expect(decision.action).toBe('allow');
    });

    it('handles empty config', () => {
      const config: PolicyConfig = {
        rules: [
          { action: 'allow', priority: 100, conditions: [] }
        ]
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({});

      expect(decision.action).toBe('allow');
    });

    it('handles undefined context values', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'allow',
            priority: 100,
            conditions: [
              { type: 'category', operator: '!=', value: 'pii' }
            ]
          }
        ]
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({ category: undefined });

      expect(decision.action).toBe('allow');
    });

    it('handles null context values', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'allow',
            priority: 100,
            conditions: [
              { type: 'category', operator: '!=', value: 'pii' }
            ]
          }
        ]
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({ category: null });

      expect(decision.action).toBe('allow');
    });

    it('handles string comparison case-insensitively', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'allow',
            priority: 100,
            conditions: [
              { type: 'category', operator: '==', value: 'PII' }
            ]
          }
        ]
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({ category: 'pii' as PatternCategory });

      expect(decision.action).toBe('allow');
    });

    it('handles number comparisons correctly', () => {
      const config: PolicyConfig = {
        rules: [
          {
            action: 'allow',
            priority: 100,
            conditions: [
              { type: 'confidence', operator: '>=', value: 0.8 }
            ]
          }
        ]
      };

      const policy = loadPolicy(config);
      const decision = policy.evaluate({ confidence: 0.8 });

      expect(decision.action).toBe('allow');
      expect(decision.confidence).toBe(0.8);
    });
  });
});
