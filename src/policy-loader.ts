import { Policy, PolicyConfig } from './policy.js';
import { InvalidPolicyConfigError, InvalidPolicyActionError, InvalidPolicyConditionError, InvalidPolicyConditionOperatorError } from './errors.js';
import { PatternAction } from './types.js';

const VALID_ACTIONS: PatternAction[] = ['mask', 'redact', 'allow', 'block'];

const VALID_CONDITION_TYPES = ['category', 'channel', 'direction', 'confidence'] as const;

const VALID_OPERATORS = ['==', '!=', '>=', '<=', '>', '<'] as const;

export function loadPolicy(config: PolicyConfig): Policy {
  validatePolicyConfig(config);
  return new Policy(config);
}

export function validatePolicyConfig(config: unknown): config is PolicyConfig {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new InvalidPolicyConfigError('Policy config must be an object');
  }

  const typedConfig = config as Record<string, unknown>;

  if (!typedConfig.rules || !Array.isArray(typedConfig.rules)) {
    throw new InvalidPolicyConfigError('Policy config must have a rules array', { rules: typedConfig.rules });
  }

  if (typedConfig.rules.length === 0) {
    throw new InvalidPolicyConfigError('Policy config must have at least one rule');
  }

  typedConfig.rules.forEach((rule: unknown, index: number) => {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
      throw new InvalidPolicyConfigError(`Rule at index ${index} must be an object`);
    }

    const typedRule = rule as Record<string, unknown>;

    if (typeof typedRule.action !== 'string' || !VALID_ACTIONS.includes(typedRule.action as PatternAction)) {
      throw new InvalidPolicyActionError('Invalid action', { action: typedRule.action, validActions: VALID_ACTIONS });
    }

    if (typedRule.priority !== undefined && (typeof typedRule.priority !== 'number' || typedRule.priority < 0)) {
      throw new InvalidPolicyConfigError(`Invalid priority in rule at index ${index}`, { priority: typedRule.priority });
    }

    if (typedRule.conditions && !Array.isArray(typedRule.conditions)) {
      throw new InvalidPolicyConfigError(`Conditions in rule at index ${index} must be an array`);
    }

    if (typedRule.conditions) {
      (typedRule.conditions as unknown[]).forEach((condition: unknown, condIndex: number) => {
        if (!condition || typeof condition !== 'object' || Array.isArray(condition)) {
          throw new InvalidPolicyConfigError(`Condition at index ${condIndex} in rule at index ${index} must be an object`);
        }

        const typedCondition = condition as Record<string, unknown>;

        if (typeof typedCondition.type !== 'string' || !VALID_CONDITION_TYPES.includes(typedCondition.type as typeof VALID_CONDITION_TYPES[number])) {
          throw new InvalidPolicyConditionError('Invalid condition type', { type: typedCondition.type, validTypes: VALID_CONDITION_TYPES });
        }

        if (typeof typedCondition.operator !== 'string' || !VALID_OPERATORS.includes(typedCondition.operator as typeof VALID_OPERATORS[number])) {
          throw new InvalidPolicyConditionOperatorError('Invalid condition operator', { operator: typedCondition.operator, validOperators: VALID_OPERATORS });
        }
      });
    }
  });

  if (typedConfig.failClosed !== undefined && typeof typedConfig.failClosed !== 'boolean') {
    throw new InvalidPolicyConfigError('failClosed must be a boolean', { failClosed: typedConfig.failClosed });
  }

  if (typedConfig.defaultAction && typeof typedConfig.defaultAction !== 'string' && !VALID_ACTIONS.includes(typedConfig.defaultAction as PatternAction)) {
    throw new InvalidPolicyConfigError('Invalid default action', { defaultAction: typedConfig.defaultAction, validActions: VALID_ACTIONS });
  }

  return true;
}
