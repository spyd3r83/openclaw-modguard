# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-01-31

### Added

#### Detection Engine
- PII detection: email, phone, SSN, credit card patterns
- Secrets detection: API keys, Bearer tokens, PEM blocks
- Network detection: IPv4, IPv6 addresses
- Confidence scoring with pattern validation (Luhn for credit cards)
- Regex compilation caching for performance

#### Tokenization System
- HMAC-SHA256 based token generation
- Per-session deterministic tokens
- Batch tokenization support
- Token format: `CATEGORY_XXXXXXXX`

#### Vault Storage
- AES-256-GCM encrypted storage
- PBKDF2 key derivation (100,000 iterations, SHA-256)
- SQLite-based persistence (better-sqlite3)
- TTL support with automatic cleanup
- Database indexes for performance

#### Policy Engine
- Rule-based policy evaluation
- Actions: mask, redact, allow, block
- Conditions: category, pattern, channel, direction, confidence
- Priority ordering with fail-closed behavior

#### Streaming Support
- Cross-chunk pattern detection
- Ring buffer for overlap handling
- StreamingMasker and StreamProcessor classes

#### Audit Logging
- JSONL format audit log
- Operations: mask, unmask, vault_store, vault_retrieve, vault_cleanup, cli
- Query, filter, and export capabilities
- Integrity verification (sequence gaps, checksums)
- Retention policy support

#### CLI Commands
- `openclaw guard vault list` - List vault entries
- `openclaw guard vault lookup` - Look up specific token
- `openclaw guard vault stats` - View vault statistics
- `openclaw guard vault delete` - GDPR right to be forgotten
- `openclaw guard vault export` - GDPR data portability
- `openclaw guard vault prune` - Clean expired entries
- `openclaw guard vault backup` - Create vault backup
- `openclaw guard vault restore` - Restore from backup
- `openclaw guard vault repair` - Repair corrupted vault
- `openclaw guard audit query` - Query audit log
- `openclaw guard audit stats` - View audit statistics
- `openclaw guard audit verify` - Verify audit integrity
- `openclaw guard audit tail` - Stream audit log
- `openclaw guard detect` - Detect PII in text
- `openclaw guard status` - Show plugin status

#### Security Hardening
- Constant-time HMAC comparisons (timing attack prevention)
- Memory zeroing for sensitive data (session keys, HMAC digests, salts)
- Secure random number generation (crypto.randomBytes)
- File permissions enforcement (0o600)

#### Performance
- Detection: <5ms for 100-500 char text
- Tokenization: <1ms per value
- Vault lookup: <2ms per token
- Regex compilation caching
- Performance monitoring utilities

#### Backup & Recovery
- Full and incremental backup support
- JSONL backup format with checksums
- Backup validation before restore
- Merge and overwrite restore modes
- Corruption detection and repair

### Security
- AES-256-GCM authenticated encryption
- PBKDF2 key derivation with 100,000 iterations
- Per-entry random IV (12 bytes)
- Constant-time comparisons for sensitive operations
- Sensitive data zeroing after use
- Vault file permissions (0o600)
- Audit logging never logs original values

### Documentation
- Comprehensive README with quick start
- Installation guide
- Configuration reference
- Security model documentation
- Troubleshooting guide
- Pattern reference

[Unreleased]: https://github.com/anomalyco/openclaw-guard/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/anomalyco/openclaw-guard/releases/tag/v0.1.0
