# Security Model

This document describes the security model, encryption implementation, and best practices for OpenClaw Guard.

## Encryption

### Algorithm

- **Cipher**: AES-256-GCM (Galois/Counter Mode)
- **Key Size**: 256 bits
- **IV Size**: 12 bytes (96 bits)
- **Authentication Tag**: 16 bytes (128 bits)

AES-GCM provides authenticated encryption, meaning it protects both confidentiality and integrity of the encrypted data.

### Key Derivation

- **Algorithm**: PBKDF2 (Password-Based Key Derivation Function 2)
- **Iterations**: 100,000
- **Hash Function**: SHA-256
- **Salt Size**: 32 bytes
- **Output Key Size**: 256 bits

Each encryption operation uses a unique salt, ensuring that the same plaintext encrypted twice produces different ciphertext.

### Storage Format

Each vault entry is stored as:
```
| IV (12 bytes) | Ciphertext (variable) | Auth Tag (16 bytes) |
```

## Threat Model

### What OpenClaw Guard Protects Against

| Threat | Mitigation |
|--------|------------|
| Vault file theft | AES-256-GCM encryption |
| Memory dumps | Sensitive data zeroing |
| Unauthorized file access | 0o600 file permissions |
| Timing attacks | Constant-time comparisons |
| Token prediction | Cryptographically secure random generation |
| Replay attacks | Per-session HMAC keys |
| Data tampering | GCM authentication tag verification |

### What OpenClaw Guard Does NOT Protect Against

| Threat | Reason |
|--------|--------|
| Physical access to running process | Process memory can be inspected |
| Malicious OpenClaw instance | Plugin runs in same process |
| Weak master key | Password strength is user responsibility |
| Key compromise | If master key is leaked, vault can be decrypted |
| Side-channel attacks | JavaScript environment limitations |
| Quantum computing | Current algorithms not quantum-resistant |

## Memory Protection

### Sensitive Data Zeroing

OpenClaw Guard actively zeros sensitive data from memory after use:

- Session keys after session ends
- HMAC digests after token generation
- Encryption salts after key derivation
- Decrypted values after use

```typescript
// Example: secureZero function
function secureZero(buffer: Buffer): void {
  buffer.fill(0);
}
```

**Limitations**: Due to JavaScript's garbage collection, we cannot guarantee data is removed from all memory locations. The zeroing prevents the buffer from being readable after the operation but GC may have copied the data.

### Constant-Time Comparisons

All sensitive comparisons use constant-time algorithms to prevent timing attacks:

```typescript
// Uses crypto.timingSafeEqual internally
function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    // Perform dummy comparison to maintain constant time
    const dummy = Buffer.alloc(a.length);
    crypto.timingSafeEqual(a, dummy);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}
```

## Access Controls

### File Permissions

Vault and audit files are created with restrictive permissions:

```
Mode: 0o600 (rw-------)
Owner: Process owner
Group: Process group
```

This ensures only the process owner can read or modify the files.

### Master Key Management

**Best Practices:**

1. **Never hardcode** the master key in configuration files
2. Use **environment variables** to inject the key
3. Use a **secret management system** (HashiCorp Vault, AWS Secrets Manager)
4. Rotate keys periodically
5. Use strong keys (32+ random bytes)

**Generating a Strong Key:**

```bash
# Generate a 32-byte random key
openssl rand -hex 32
```

### Session Keys

Each session generates a unique HMAC key:
- 256-bit random key
- Used for deterministic token generation within session
- Zeroed when session ends

## GDPR Compliance

### Right to Be Forgotten

Users can request deletion of their data:

```bash
openclaw guard vault delete --contains "user@example.com"
```

This will:
1. Search for all entries containing the value
2. Delete matching entries from the vault
3. Log the deletion in the audit log

### Data Portability

Users can export their data:

```bash
openclaw guard vault export --contains "user@example.com" --output data.json
```

**Note**: Exported data contains metadata only (tokens, categories, timestamps). Original values are stored encrypted in the vault.

### Data Minimization

- Set TTL (time-to-live) for automatic data expiration
- Run regular cleanup: `openclaw guard vault prune`
- Only store what's necessary for unmasking

## Audit Logging

### What Is Logged

- Operation type (mask, unmask, vault operations)
- Session ID
- Timestamp
- Duration
- Success/failure status
- Token counts and categories

### What Is NOT Logged

- **Original sensitive values** (never logged)
- Master key
- Encryption keys
- Decrypted content

### Log Integrity

Audit logs include:
- Sequence numbers (gap detection)
- Checksums (tamper detection)

Verify integrity:
```bash
openclaw guard audit verify
```

## Security Hardening Checklist

### Production Deployment

- [ ] Set strong master key (32+ random bytes)
- [ ] Use environment variables for secrets
- [ ] Set `failClosed: true` in policy
- [ ] Enable audit logging
- [ ] Set appropriate TTL for data
- [ ] Verify file permissions (0o600)
- [ ] Run in isolated container/VM
- [ ] Monitor audit logs
- [ ] Regular security updates

### Key Rotation

To rotate the master key:

1. Export current vault: `openclaw guard vault backup --output backup.jsonl`
2. Update master key in environment
3. Create new vault
4. Restore from backup: `openclaw guard vault restore backup.jsonl`

**Note**: The backup file contains encrypted data. The restore process re-encrypts with the new key.

## Vulnerability Reporting

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Email: security@anomalyco.com
3. Include detailed reproduction steps
4. Allow time for a fix before disclosure

We aim to acknowledge reports within 48 hours and provide fixes within 30 days for critical issues.

## Security Audit

OpenClaw Guard has been reviewed for:

- [ ] Vault file encrypted with AES-256-GCM
- [ ] Key derivation uses PBKDF2 with 100k+ iterations
- [ ] Vault file permissions set to 0o600
- [ ] Master key never stored in plaintext
- [ ] Sensitive data zeroed from memory after use
- [ ] Constant-time comparisons for sensitive operations
- [ ] No sensitive data in logs
- [ ] No sensitive data in error messages
- [ ] Input validation for all user input
- [ ] SQL injection protection (parameterized queries)
- [ ] Path traversal protection

See `docs/security-audit-report.md` for full audit results.
