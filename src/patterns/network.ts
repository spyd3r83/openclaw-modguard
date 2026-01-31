import { Pattern, PatternType, PatternCategory } from '../types.js';

export const networkPatterns: Pattern[] = [
  {
    type: PatternType.IPV4,
    category: PatternCategory.NETWORK,
    regex: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    confidence: 0.8,
    description: 'IPv4 address',
    examples: ['192.168.1.1', '8.8.8.8', '172.16.254.1', '10.0.0.1']
  },
  {
    type: PatternType.IPV6,
    category: PatternCategory.NETWORK,
    regex: /\b(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}\b|\b(?:[A-Fa-f0-9]{1,4}:){1,7}:\b|\b:(?:[A-Fa-f0-9]{1,4}:){0,6}[A-Fa-f0-9]{1,4}\b|\b(?:[A-Fa-f0-9]{1,4}:){1,6}:[A-Fa-f0-9]{1,4}\b|\b(?:[A-Fa-f0-9]{1,4}:){1,5}(?::[A-Fa-f0-9]{1,4}){1,2}\b|\b(?:[A-Fa-f0-9]{1,4}:){1,4}(?::[A-Fa-f0-9]{1,4}){1,3}\b|\b(?:[A-Fa-f0-9]{1,4}:){1,3}(?::[A-Fa-f0-9]{1,4}){1,4}\b|\b(?:[A-Fa-f0-9]{1,4}:){1,2}(?::[A-Fa-f0-9]{1,4}){1,5}\b|\b[A-Fa-f0-9]{1,4}:(?::[A-Fa-f0-9]{1,4}){1,6}\b|\b:(?::[A-Fa-f0-9]{1,4}){1,7}\b|\b:(?::[A-Fa-f0-9]{1,4}){0,7}%[0-9]+\b/g,
    confidence: 0.8,
    description: 'IPv6 address',
    examples: [
      '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
      '::1',
      'fe80::1ff:fe23:4567:890a',
      '2001:db8::1',
      '::ffff:192.0.2.1'
    ]
  }
];
