export class VaultError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'VaultError';
    Object.setPrototypeOf(this, VaultError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code
    };
  }
}

export class EncryptionError extends VaultError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'ENCRYPTION_FAILED', context);
    this.name = 'EncryptionError';
    Object.setPrototypeOf(this, EncryptionError.prototype);
  }
}

export class KeyDerivationError extends VaultError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'KEY_DERIVATION_FAILED', context);
    this.name = 'KeyDerivationError';
    Object.setPrototypeOf(this, KeyDerivationError.prototype);
  }
}

export class TokenizationError extends VaultError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'TOKENIZATION_FAILED', context);
    this.name = 'TokenizationError';
    Object.setPrototypeOf(this, TokenizationError.prototype);
  }
}

export class DetokenizationError extends VaultError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'DETOKENIZATION_FAILED', context);
    this.name = 'DetokenizationError';
    Object.setPrototypeOf(this, DetokenizationError.prototype);
  }
}

export class InvalidTokenError extends VaultError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'INVALID_TOKEN', context);
    this.name = 'InvalidTokenError';
    Object.setPrototypeOf(this, InvalidTokenError.prototype);
  }
}

export class PolicyError extends VaultError {
  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message, code, context);
    this.name = 'PolicyError';
    Object.setPrototypeOf(this, PolicyError.prototype);
  }
}

export class InvalidPolicyActionError extends PolicyError {
  constructor(message: string, context?: Record<string, unknown>) {
    const mergedContext = context ? { ...context, action: context.action } : { action: undefined };
    super(message, 'INVALID_ACTION', mergedContext);
    this.name = 'InvalidPolicyActionError';
    Object.setPrototypeOf(this, InvalidPolicyActionError.prototype);
  }
}

export class InvalidPolicyConditionError extends PolicyError {
  constructor(message: string, context?: Record<string, unknown>) {
    const mergedContext = context ? { ...context, condition: context.condition } : { condition: undefined };
    super(message, 'INVALID_CONDITION', mergedContext);
    this.name = 'InvalidPolicyConditionError';
    Object.setPrototypeOf(this, InvalidPolicyConditionError.prototype);
  }
}

export class InvalidPolicyConditionOperatorError extends PolicyError {
  constructor(message: string, context?: Record<string, unknown>) {
    const mergedContext = context ? { ...context, operator: context.operator } : { operator: undefined };
    super(message, 'INVALID_OPERATOR', mergedContext);
    this.name = 'InvalidPolicyConditionOperatorError';
    Object.setPrototypeOf(this, InvalidPolicyConditionOperatorError.prototype);
  }
}

export class InvalidPolicyConfigError extends PolicyError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'INVALID_CONFIG', context);
    this.name = 'InvalidPolicyConfigError';
    Object.setPrototypeOf(this, InvalidPolicyConfigError.prototype);
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
    Object.setPrototypeOf(this, AuditError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code
    };
  }
}

export class AuditLogError extends AuditError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'AUDIT_LOG_FAILED', context);
    this.name = 'AuditLogError';
    Object.setPrototypeOf(this, AuditLogError.prototype);
  }
}

export class AuditWriteError extends AuditError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'AUDIT_WRITE_FAILED', context);
    this.name = 'AuditWriteError';
    Object.setPrototypeOf(this, AuditWriteError.prototype);
  }
}

export class AuditReadError extends AuditError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'AUDIT_READ_FAILED', context);
    this.name = 'AuditReadError';
    Object.setPrototypeOf(this, AuditReadError.prototype);
  }
}

export class AuditIntegrityError extends AuditError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'AUDIT_INTEGRITY_FAILED', context);
    this.name = 'AuditIntegrityError';
    Object.setPrototypeOf(this, AuditIntegrityError.prototype);
  }
}

export class AuditRetentionPolicyError extends AuditError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'AUDIT_RETENTION_POLICY_ERROR', context);
    this.name = 'AuditRetentionPolicyError';
    Object.setPrototypeOf(this, AuditRetentionPolicyError.prototype);
  }
}

export class DetectionError extends VaultError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'DETECTION_FAILED', context);
    this.name = 'DetectionError';
    Object.setPrototypeOf(this, DetectionError.prototype);
  }
}
