import { Pattern, PatternCategory } from '../types.js';
import { piiPatterns } from './pii.js';
import { secretsPatterns } from './secrets.js';
import { networkPatterns } from './network.js';

export const allPatterns: Pattern[] = [...piiPatterns, ...secretsPatterns, ...networkPatterns];

export function getPatterns(category?: PatternCategory): Pattern[] {
  if (!category) {
    return allPatterns;
  }
  return allPatterns.filter((p) => p.category === category);
}
