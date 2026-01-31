export class VaultError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'VaultError';
  }
}

export class EncryptionError extends VaultError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'ENCRYPTION_FAILED', context);
    this.name = 'EncryptionError';
  }
}

export class KeyDerivationError extends VaultError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'KEY_DERIVATION_FAILED', context);
    this.name = 'KeyDerivationError';
  }
}

export class TokenizationError extends VaultError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'TOKENIZATION_FAILED', context);
    this.name = 'TokenizationError';
  }
}

export class DetokenizationError extends VaultError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'DETOKENIZATION_FAILED', context);
    this.name = 'DetokenizationError';
  }
}

export class InvalidTokenError extends VaultError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'INVALID_TOKEN', context);
    this.name = 'InvalidTokenError';
  }
}

export class PolicyError extends VaultError {
  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message, code, context);
    this.name = 'PolicyError';
  }
}

export class InvalidPolicyActionError extends PolicyError {
  constructor(message: string, context?: Record<string, unknown>) {
    const mergedContext = context ? { ...context, action: context.action } : { action: undefined };
    super(message, 'INVALID_ACTION', mergedContext);
    this.name = 'InvalidPolicyActionError';
  }
}

export class InvalidPolicyConditionError extends PolicyError {
  constructor(message: string, context?: Record<string, unknown>) {
    const mergedContext = context ? { ...context, condition: context.condition } : { condition: undefined };
    super(message, 'INVALID_CONDITION', mergedContext);
    this.name = 'InvalidPolicyConditionError';
  }
}

export class InvalidPolicyConditionOperatorError extends PolicyError {
  constructor(message: string, context?: Record<string, unknown>) {
    const mergedContext = context ? { ...context, operator: context.operator } : { operator: undefined };
    super(message, 'INVALID_OPERATOR', mergedContext);
    this.name = 'InvalidPolicyConditionOperatorError';
  }
}

export class InvalidPolicyConfigError extends PolicyError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'INVALID_CONFIG', context);
    this.name = 'InvalidPolicyConfigError';
  }
}

export class AuditError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AuditError';
  }
}

export class AuditLogError extends AuditError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'AUDIT_LOG_FAILED', context);
    this.name = 'AuditLogError';
  }
}

export class AuditWriteError extends AuditError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'AUDIT_WRITE_FAILED', context);
    this.name = 'AuditWriteError';
  }
}

export class AuditReadError extends AuditError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'AUDIT_READ_FAILED', context);
    this.name = 'AuditReadError';
  }
}

export class AuditIntegrityError extends AuditError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'AUDIT_INTEGRITY_FAILED', context);
    this.name = 'AuditIntegrityError';
  }
}

export class AuditRetentionPolicyError extends AuditError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'AUDIT_RETENTION_POLICY_ERROR', context);
    this.name = 'AuditRetentionPolicyError';
  }
}
