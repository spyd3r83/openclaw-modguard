import { Pattern, PatternType, PatternCategory } from '../types.js';

export const secretsPatterns: Pattern[] = [
  {
    type: PatternType.API_KEY,
    category: PatternCategory.SECRETS,
    regex: /\b(sk-|ghp_|github_pat_|xox[baprs]-|xapp-|gsk_|AIza|pplx-|npm_)[A-Za-z0-9_\-]{16,}/g,
    confidence: 0.9,
    description: 'API key with known prefix',
    examples: ['sk-proj-abc123def456...', 'ghp_XYZ789ABC123', 'xoxb-12345-67890-abcdef', 'AIzaSyC-abc123def456']
  },
  {
    type: PatternType.BEARER_TOKEN,
    category: PatternCategory.SECRETS,
    regex: /(?:Authorization:\s*)?Bearer\s+([A-Za-z0-9\-._~+/]+=*)/gi,
    confidence: 0.85,
    description: 'Bearer authentication token',
    examples: ['Authorization: Bearer eyJhbGc...', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', 'Bearer abc123xyz789']
  },
  {
    type: PatternType.PEM_BLOCK,
    category: PatternCategory.SECRETS,
    regex: /-----BEGIN[A-Z\s]*(?:PRIVATE KEY|CERTIFICATE|PUBLIC KEY)-----[\s\S]+?-----END[A-Z\s]*(?:PRIVATE KEY|CERTIFICATE|PUBLIC KEY)-----/gi,
    confidence: 1.0,
    description: 'PEM-encoded private key or certificate',
    examples: [
      '-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----',
      '-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----',
      '-----BEGIN EC PRIVATE KEY-----\n...\n-----END EC PRIVATE KEY-----'
    ]
  }
];
