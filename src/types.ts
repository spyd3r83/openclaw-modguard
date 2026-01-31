export enum PatternCategory {
  PII = 'pii',
  SECRETS = 'secrets',
  NETWORK = 'network'
}

export enum PatternType {
  EMAIL = 'email',
  PHONE = 'phone',
  SSN = 'ssn',
  CREDIT_CARD = 'credit_card',
  API_KEY = 'api_key',
  BEARER_TOKEN = 'bearer_token',
  PEM_BLOCK = 'pem_block',
  IPV4 = 'ipv4',
  IPV6 = 'ipv6'
}

export interface DetectionResult {
  category: PatternCategory;
  pattern: PatternType;
  match: string;
  start: number;
  end: number;
  confidence: number;
}

export interface Pattern {
  type: PatternType;
  category: PatternCategory;
  regex: RegExp;
  confidence: number;
  description: string;
  examples: string[];
  validator?: (match: string) => { valid: boolean; confidenceMultiplier?: number };
}

export type AuditOperationType = 'mask' | 'unmask' | 'vault_store' | 'vault_retrieve' | 'vault_cleanup' | 'cli';

export type LogLevel = 'info' | 'warn' | 'error';

export interface AuditEntry {
  sequence: number;
  timestamp: string;
  operation: AuditOperationType;
  sessionId: string;
  level: LogLevel;
  success: boolean;
  duration?: number;
  details: AuditEntryDetails;
}

export type AuditEntryDetails = MaskAuditDetails | UnmaskAuditDetails | VaultAuditDetails | CliAuditDetails;

export interface MaskAuditDetails {
  category: PatternType;
  tokenCount: number;
  categories: Record<string, number>;
  confidenceScores?: Record<string, number>;
}

export interface UnmaskAuditDetails {
  tokenCount: number;
  categories: string[];
}

export interface VaultAuditDetails {
  vaultOperation: 'store' | 'retrieve' | 'cleanup';
  category?: string;
  entryCount?: number;
  found?: boolean;
  reason?: string;
}

export interface CliAuditDetails {
  command: string;
  args: string[];
  sanitized?: boolean;
}

export interface AuditFilter {
  session?: string;
  operation?: AuditOperationType[];
  category?: string[];
  start?: Date;
  end?: Date;
  level?: LogLevel;
}

export interface AuditStats {
  totalEntries: number;
  operationCounts: Record<AuditOperationType, number>;
  categoryCounts: Record<string, number>;
  sessionCounts: Record<string, number>;
  errorCount: number;
  successRate: number;
  averageDuration: number;
  timeRange: { start: string; end: string };
}

export interface IntegrityReport {
  valid: boolean;
  sequenceGaps: number[];
  duplicateEntries: number[];
  corruptedLines: number[];
  checksum?: string;
}

export interface RetentionPolicy {
  enabled: boolean;
  maxAgeDays: number;
  maxFileSizeMB: number;
  compressionEnabled: boolean;
}

export type PatternAction = 'mask' | 'redact' | 'allow' | 'block';

export interface PolicyCondition {
  type: string;
  operator: string;
  value: unknown;
}

export interface PolicyRule {
  name: string;
  action: PatternAction;
  priority: number;
  conditions: PolicyCondition[];
}

export interface PolicyConfig {
  rules: PolicyRule[];
}
