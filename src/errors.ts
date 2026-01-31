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
