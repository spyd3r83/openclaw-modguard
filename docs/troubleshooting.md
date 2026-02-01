# Troubleshooting Guide

## Common Issues

### Plugin Doesn't Load

**Symptoms:**
- OpenClaw doesn't recognize guard commands
- Plugin not listed in `openclaw plugins list`

**Solutions:**

1. **Verify installation:**
   ```bash
   npm list -g openclaw-modguard
   ```

2. **Reinstall the plugin:**
   ```bash
   openclaw plugins uninstall openclaw-modguard
   openclaw plugins install openclaw-modguard
   ```

3. **Check Node.js version:**
   ```bash
   node --version
   # Must be >= 22.0.0
   ```

4. **Check OpenClaw version:**
   ```bash
   openclaw --version
   # Must be >= 2026.1.29
   ```

### Vault Access Errors

**Symptoms:**
- "Cannot open vault" errors
- "Permission denied" errors
- "Database is locked" errors

**Solutions:**

1. **Check file permissions:**
   ```bash
   ls -la ~/.openclaw/guard/vault.db
   # Should show -rw------- (0600)
   ```

2. **Fix permissions:**
   ```bash
   chmod 600 ~/.openclaw/guard/vault.db
   ```

3. **Check for locks:**
   ```bash
   # Remove stale lock files
   rm -f ~/.openclaw/guard/vault.db-journal
   rm -f ~/.openclaw/guard/vault.db-wal
   rm -f ~/.openclaw/guard/vault.db-shm
   ```

4. **Verify master key is set:**
   ```bash
   echo $GUARD_MASTER_KEY
   # Should not be empty
   ```

### Detection Not Working

**Symptoms:**
- PII not being detected
- Known patterns not recognized

**Solutions:**

1. **Check confidence threshold:**
   ```bash
   # Lower threshold if needed
   openclaw guard detect "test@example.com" --min-confidence 0.5
   ```

2. **Verify pattern category is enabled:**
   - Check configuration includes all needed categories

3. **Test specific patterns:**
   ```bash
   openclaw guard detect "My email: test@example.com"
   openclaw guard detect "My phone: (555) 123-4567"
   openclaw guard detect "My SSN: 123-45-6789"
   ```

### False Positives

**Symptoms:**
- Non-sensitive data being detected as PII
- Version numbers detected as IPs
- Random numbers detected as SSNs

**Solutions:**

1. **Increase confidence threshold:**
   ```json
   {
     "detection": {
       "minConfidence": 0.8
     }
   }
   ```

2. **Use policy to allow specific patterns:**
   ```json
   {
     "policy": {
       "rules": [
         {
           "name": "allow-low-confidence",
           "action": "allow",
           "priority": 100,
           "conditions": [
             { "type": "confidence", "operator": "<", "value": 0.7 }
           ]
         }
       ]
     }
   }
   ```

3. **Report false positives** to help improve patterns

### False Negatives

**Symptoms:**
- Known sensitive data not detected
- Unusual formats not recognized

**Solutions:**

1. **Lower confidence threshold:**
   ```json
   {
     "detection": {
       "minConfidence": 0.3
     }
   }
   ```

2. **Check if category is enabled:**
   - Ensure all needed categories are in the configuration

3. **Report false negatives** with examples

### Performance Issues

**Symptoms:**
- Slow detection
- High latency on mask/unmask
- Timeouts

**Solutions:**

1. **Check vault size:**
   ```bash
   openclaw guard vault stats
   # Large vaults may slow down lookups
   ```

2. **Prune expired entries:**
   ```bash
   openclaw guard vault prune
   ```

3. **Check input size:**
   - Very long texts (>5000 chars) take longer
   - Consider chunking large inputs

4. **Monitor performance:**
   ```bash
   # Check operation latency in audit log
   openclaw guard audit stats
   ```

### Encryption Errors

**Symptoms:**
- "Decryption failed" errors
- "Invalid auth tag" errors
- "Key derivation failed" errors

**Solutions:**

1. **Verify master key hasn't changed:**
   - The vault must be decrypted with the same key used to encrypt

2. **Check for vault corruption:**
   ```bash
   openclaw guard vault repair
   ```

3. **Restore from backup:**
   ```bash
   openclaw guard vault restore backup.jsonl --force
   ```

### Native Module Errors

**Symptoms:**
- "Cannot find module better-sqlite3" errors
- "Could not locate the bindings file" errors

**Solutions:**

1. **Rebuild native modules:**
   ```bash
   npm rebuild better-sqlite3
   ```

2. **Reinstall with build tools:**
   ```bash
   # Linux
   sudo apt-get install build-essential python3

   # macOS
   xcode-select --install

   # Then reinstall
   npm uninstall -g openclaw-modguard
   npm install -g openclaw-modguard
   ```

3. **Check Node.js version compatibility:**
   - Ensure better-sqlite3 supports your Node.js version

## Error Messages

### "Invalid token format"

The token doesn't match the expected format `CATEGORY_XXXXXXXX`.

**Causes:**
- Corrupted token
- Wrong token copied
- Token from different system

### "Token not found in vault"

The token exists but the value is not in the vault.

**Causes:**
- Vault was cleared or reset
- Entry expired (TTL)
- Different vault file
- Different master key

### "Invalid session ID"

The session referenced doesn't exist.

**Causes:**
- Session was cleared
- Server restarted
- Using old session ID

### "Value cannot be empty"

Attempted to tokenize an empty string.

**Causes:**
- Empty input
- Preprocessing removed all content

## Debugging

### Enable Debug Logging

```bash
export DEBUG=openclaw-modguard:*
openclaw guard detect "test@example.com"
```

### Check Audit Log

```bash
# Recent operations
openclaw guard audit query --limit 10

# Failed operations
openclaw guard audit query --level error

# Specific operation type
openclaw guard audit query --operation mask
```

### Verify Vault Integrity

```bash
# Check vault health
openclaw guard vault stats

# Verify no corruption
openclaw guard vault repair --dry-run
```

### Test Configuration

```bash
# Validate policy configuration
openclaw guard policy validate config.json
```

## Getting Help

If the issue persists:

1. **Search existing issues**: https://github.com/spyd3r83/openclaw-modguard/issues

2. **Create a new issue** with:
   - Node.js version
   - OpenClaw version
   - OpenClaw Guard version
   - Error messages
   - Steps to reproduce
   - Relevant configuration (without secrets)

3. **Check documentation**:
   - [Installation Guide](installation.md)
   - [Configuration Reference](configuration.md)
   - [Security Model](security.md)
