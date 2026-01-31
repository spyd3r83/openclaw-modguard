# Configuration Reference

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GUARD_VAULT_PATH` | Path to vault database | `/tmp/openclaw-guard-vault.db` |
| `GUARD_MASTER_KEY` | Master encryption key | `default-master-key` |

**Security Note**: Always set `GUARD_MASTER_KEY` to a strong, unique value in production.

## Configuration File

Configuration can be provided via:
1. Environment variables
2. Plugin configuration in OpenClaw
3. JSON configuration file

### JSON Configuration Schema

```json
{
  "vaultPath": "string",
  "masterKey": "string",
  "policy": {
    "failClosed": "boolean",
    "rules": [
      {
        "name": "string",
        "action": "mask | redact | allow | block",
        "priority": "number",
        "conditions": [
          {
            "type": "category | channel | direction | confidence",
            "operator": "== | != | >= | <= | > | <",
            "value": "any"
          }
        ]
      }
    ]
  }
}
```

## Policy Configuration

### Policy Actions

| Action | Description |
|--------|-------------|
| `mask` | Replace sensitive data with tokens, store original in vault |
| `redact` | Replace sensitive data with `[REDACTED]`, original not stored |
| `allow` | Pass through without modification |
| `block` | Prevent message from being processed |

### Condition Types

| Type | Description | Example Values |
|------|-------------|----------------|
| `category` | Pattern category | `pii`, `secrets`, `network` |
| `pattern` | Specific pattern type | `email`, `phone`, `ssn`, `credit_card`, `api_key`, etc. |
| `channel` | Communication channel | `internal`, `external` |
| `direction` | Message direction | `inbound`, `outbound` |
| `confidence` | Detection confidence | `0.0` to `1.0` |

### Operators

| Operator | Description |
|----------|-------------|
| `==` | Equal to |
| `!=` | Not equal to |
| `>=` | Greater than or equal |
| `<=` | Less than or equal |
| `>` | Greater than |
| `<` | Less than |

### Priority

Rules are evaluated in **descending priority order** (highest first). First matching rule is applied.

### Fail-Closed Behavior

When `failClosed: true` (recommended), if no rules match, the default action is `block`. This provides security by default.

## Policy Examples

### Block Credit Cards

```json
{
  "policy": {
    "failClosed": true,
    "rules": [
      {
        "name": "block-credit-cards",
        "action": "block",
        "priority": 100,
        "conditions": [
          { "type": "pattern", "operator": "==", "value": "credit_card" }
        ]
      }
    ]
  }
}
```

### Mask High-Confidence PII

```json
{
  "policy": {
    "rules": [
      {
        "name": "mask-high-confidence",
        "action": "mask",
        "priority": 100,
        "conditions": [
          { "type": "category", "operator": "==", "value": "pii" },
          { "type": "confidence", "operator": ">=", "value": 0.9 }
        ]
      },
      {
        "name": "allow-low-confidence",
        "action": "allow",
        "priority": 50,
        "conditions": [
          { "type": "confidence", "operator": "<", "value": 0.5 }
        ]
      }
    ]
  }
}
```

### Redact Secrets

```json
{
  "policy": {
    "rules": [
      {
        "name": "redact-all-secrets",
        "action": "redact",
        "priority": 100,
        "conditions": [
          { "type": "category", "operator": "==", "value": "secrets" }
        ]
      }
    ]
  }
}
```

### Allow Internal Network

```json
{
  "policy": {
    "rules": [
      {
        "name": "allow-internal-ips",
        "action": "allow",
        "priority": 100,
        "conditions": [
          { "type": "category", "operator": "==", "value": "network" },
          { "type": "channel", "operator": "==", "value": "internal" }
        ]
      }
    ]
  }
}
```

## Vault Configuration

### TTL (Time-to-Live)

Entries can have automatic expiration:

```json
{
  "vault": {
    "defaultTTL": 86400000
  }
}
```

TTL is specified in milliseconds. Set to `null` for no expiration.

### Cleanup

Expired entries are automatically cleaned on vault initialization. Manual cleanup:

```bash
openclaw guard vault prune
```

## Audit Configuration

### Log Location

Audit logs are stored at: `~/.openclaw/guard/audit.jsonl`

### Retention Policy

```json
{
  "audit": {
    "retention": {
      "enabled": true,
      "maxAgeDays": 90,
      "maxFileSizeMB": 100,
      "compressionEnabled": false
    }
  }
}
```

## Detection Configuration

### Minimum Confidence

Set minimum confidence threshold for detection:

```json
{
  "detection": {
    "minConfidence": 0.5
  }
}
```

### Category Filtering

Limit detection to specific categories:

```json
{
  "detection": {
    "categories": ["pii", "secrets"]
  }
}
```

## Complete Configuration Example

```json
{
  "vaultPath": "~/.openclaw/guard/vault.db",
  "masterKey": "${GUARD_MASTER_KEY}",
  "vault": {
    "defaultTTL": null
  },
  "detection": {
    "minConfidence": 0.5,
    "categories": ["pii", "secrets", "network"]
  },
  "policy": {
    "failClosed": true,
    "rules": [
      {
        "name": "block-credit-cards",
        "action": "block",
        "priority": 200,
        "conditions": [
          { "type": "pattern", "operator": "==", "value": "credit_card" }
        ]
      },
      {
        "name": "redact-secrets",
        "action": "redact",
        "priority": 150,
        "conditions": [
          { "type": "category", "operator": "==", "value": "secrets" }
        ]
      },
      {
        "name": "mask-high-confidence-pii",
        "action": "mask",
        "priority": 100,
        "conditions": [
          { "type": "category", "operator": "==", "value": "pii" },
          { "type": "confidence", "operator": ">=", "value": 0.8 }
        ]
      },
      {
        "name": "allow-low-confidence",
        "action": "allow",
        "priority": 50,
        "conditions": [
          { "type": "confidence", "operator": "<", "value": 0.5 }
        ]
      }
    ]
  },
  "audit": {
    "retention": {
      "enabled": true,
      "maxAgeDays": 90,
      "maxFileSizeMB": 100
    }
  }
}
```
