import { PatternCategory, PatternType } from './types.js';

export type PolicyAction = 'mask' | 'redact' | 'allow' | 'block';

export interface PolicyRule {
  action: PolicyAction;
  priority: number;
  conditions?: PolicyCondition[];
}

export interface PolicyContext {
  category?: PatternCategory;
  channel?: string;
  direction?: 'inbound' | 'outbound';
  confidence?: number;
}

export interface PolicyDecision {
  action: PolicyAction;
  maskedContent?: string;
  content?: string;
  tokenMapping?: Record<string, { original: string; category: string; pattern: string }>;
  redactedContent?: string;
  originalContent?: string;
  blockReason?: string;
  cancel?: boolean;
  category?: string;
  confidence?: number;
}

export interface PolicyCondition {
  type: 'category' | 'channel' | 'direction' | 'confidence';
  operator: '==' | '!=' | '>=' | '<=' | '>' | '<';
  value: unknown;
}

export interface PolicyConfig {
  rules: PolicyRule[];
  failClosed?: boolean;
  defaultAction?: PolicyAction;
}

export class Policy {
  private rules: PolicyRule[];
  private failClosed: boolean;
  private defaultAction: PolicyAction;

  constructor(config: PolicyConfig) {
    this.rules = this.sortRulesByPriority(config.rules || []);
    this.failClosed = config.failClosed ?? true;
    this.defaultAction = config.defaultAction ?? 'allow';
  }

  private sortRulesByPriority(rules: PolicyRule[]): PolicyRule[] {
    return [...rules].sort((a, b) => b.priority - a.priority);
  }

  evaluate(context: PolicyContext): PolicyDecision {
    for (const rule of this.rules) {
      if (this.evaluateRule(rule, context)) {
        return this.buildDecision(rule.action, context, rule);
      }
    }

    if (this.failClosed) {
      return {
        action: 'block',
        blockReason: 'No matching policy rule (failClosed=true)'
      };
    }

    return {
      action: this.defaultAction,
      content: context.originalContent || ''
    };
  }

  private evaluateRule(rule: PolicyRule, context: PolicyContext): boolean {
    if (!rule.conditions || rule.conditions.length === 0) {
      return true;
    }

    return rule.conditions.every((condition) => this.evaluateCondition(condition, context));
  }

  private evaluateCondition(condition: PolicyCondition, context: PolicyContext): boolean {
    const contextValue = this.getContextValue(condition.type, context);

    if (contextValue === undefined || contextValue === null) {
      return false;
    }

    switch (condition.operator) {
      case '==':
        return this.isEqual(contextValue, condition.value);
      case '!=':
        return !this.isEqual(contextValue, condition.value);
      case '>=':
        return this.isGreaterOrEqual(contextValue, condition.value);
      case '<=':
        return this.isLessOrEqual(contextValue, condition.value);
      case '>':
        return this.isGreater(contextValue, condition.value);
      case '<':
        return this.isLess(contextValue, condition.value);
      default:
        return false;
    }
  }

  private getContextValue(type: PolicyCondition['type'], context: PolicyContext): unknown {
    switch (type) {
      case 'category':
        return context.category;
      case 'channel':
        return context.channel;
      case 'direction':
        return context.direction;
      case 'confidence':
        return context.confidence;
      default:
        return undefined;
    }
  }

  private isEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a === 'string' && typeof b === 'string') {
      return a.toLowerCase() === b.toLowerCase();
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      return a.length === b.length && a.every((val, idx) => this.isEqual(val, b[idx]));
    }
    return false;
  }

  private isGreaterOrEqual(a: unknown, b: unknown): boolean {
    if (typeof a === 'number' && typeof b === 'number') {
      return a >= b;
    }
    return false;
  }

  private isLessOrEqual(a: unknown, b: unknown): boolean {
    if (typeof a === 'number' && typeof b === 'number') {
      return a <= b;
    }
    return false;
  }

  private isGreater(a: unknown, b: unknown): boolean {
    if (typeof a === 'number' && typeof b === 'number') {
      return a > b;
    }
    return false;
  }

  private isLess(a: unknown, b: unknown): boolean {
    if (typeof a === 'number' && typeof b === 'number') {
      return a < b;
    }
    return false;
  }

  private buildDecision(action: PolicyAction, context: PolicyContext, rule: PolicyRule): PolicyDecision {
    const decision: PolicyDecision = {
      action,
      matchedRule: rule,
      cancel: action === 'block'
    };

    if (context.category) {
      decision.category = context.category;
    }
    if (context.confidence !== undefined) {
      decision.confidence = context.confidence;
    }

    return decision;
  }

  findFirstMatchingRule(context: PolicyContext): PolicyRule | null {
    for (const rule of this.rules) {
      if (this.evaluateRule(rule, context)) {
        return rule;
      }
    }
    return null;
  }

  updateRules(rules: PolicyRule[]): void {
    this.rules = this.sortRulesByPriority(rules);
  }
}
