# Pattern Reference

This document describes all detection patterns supported by OpenClaw Guard.

## Pattern Categories

| Category | Description |
|----------|-------------|
| `pii` | Personally Identifiable Information |
| `secrets` | API keys, tokens, and credentials |
| `network` | Network identifiers (IP addresses) |

## PII Patterns

### Email

**Pattern Type**: `email`

**Description**: Detects email addresses in standard formats.

**Base Confidence**: 0.95

**Regex**: `[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`

**Examples**:
- `user@example.com`
- `john.doe+tag@company.co.uk`
- `support@subdomain.domain.org`

**Validation**: Format validation (contains @ and valid TLD)

**Limitations**:
- May not detect uncommon TLDs
- IP-based emails (user@[192.168.1.1]) not supported
- Quoted local parts not supported

---

### Phone

**Pattern Type**: `phone`

**Description**: Detects phone numbers in international formats.

**Base Confidence**: 0.85

**Regex**: Matches various formats including:
- `(555) 123-4567`
- `555-123-4567`
- `+1-555-123-4567`
- `+44 20 1234 5678`
- Extensions: `x1234`, `ext. 1234`

**Examples**:
- `(555) 123-4567`
- `+1 (555) 123-4567`
- `555.123.4567`
- `1-800-555-1234 ext 567`

**Validation**: Length and format checks

**Limitations**:
- Short codes (e.g., 911) not detected
- May match non-phone number sequences

---

### SSN (Social Security Number)

**Pattern Type**: `ssn`

**Description**: Detects US Social Security Numbers.

**Base Confidence**: 0.95

**Regex**: `(?!000|666|9\d{2})\d{3}[- ]?(?!00)\d{2}[- ]?(?!0000)\d{4}`

**Examples**:
- `123-45-6789`
- `123 45 6789`
- `123456789`

**Validation**:
- Excludes invalid area numbers (000, 666, 900-999)
- Excludes invalid group numbers (00)
- Excludes invalid serial numbers (0000)

**Limitations**:
- May match similar 9-digit patterns
- Does not validate against SSA database

---

### Credit Card

**Pattern Type**: `credit_card`

**Description**: Detects credit card numbers.

**Base Confidence**: 0.30 (base) → 0.90 (after Luhn validation)

**Regex**: Matches 13-19 digit sequences with optional separators

**Examples**:
- `4111111111111111` (Visa)
- `5500000000000004` (Mastercard)
- `4111-1111-1111-1111`
- `4111 1111 1111 1111`

**Validation**:
- **Luhn Algorithm**: Validates checksum
- Confidence multiplied by 3x if Luhn passes

**Limitations**:
- May match other long number sequences
- Test card numbers will be detected

## Secrets Patterns

### API Key

**Pattern Type**: `api_key`

**Description**: Detects API keys with known prefixes.

**Base Confidence**: 0.90

**Known Prefixes**:
- `sk-` (OpenAI, Stripe)
- `ghp_` (GitHub Personal Access Token)
- `github_pat_` (GitHub PAT)
- `xox` (Slack)
- `aiza` (Firebase)
- `pplx-` (Perplexity)
- `npm_` (npm)

**Examples**:
- `sk-1234567890abcdef`
- `ghp_1234567890abcdefghij`
- `xoxb-1234567890-1234567890`

**Validation**: Prefix match and minimum length

**Limitations**:
- Unknown API key formats not detected
- Generic keys without known prefixes missed

---

### Bearer Token

**Pattern Type**: `bearer_token`

**Description**: Detects Bearer authentication tokens.

**Base Confidence**: 0.85

**Regex**: `Bearer\s+[A-Za-z0-9\-._~+/]+=*`

**Examples**:
- `Bearer abc123def456`
- `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- `Bearer sk-proj-123456`

**Validation**: Must start with "Bearer " followed by token characters

**Limitations**:
- Requires "Bearer" prefix
- May match "Bearer" in documentation text

---

### PEM Block

**Pattern Type**: `pem_block`

**Description**: Detects PEM-encoded cryptographic data.

**Base Confidence**: 1.00

**Regex**: `-----BEGIN [A-Z ]+ -----[\s\S]+?-----END [A-Z ]+-----`

**Examples**:
- `-----BEGIN RSA PRIVATE KEY-----`
- `-----BEGIN CERTIFICATE-----`
- `-----BEGIN OPENSSH PRIVATE KEY-----`
- `-----BEGIN PUBLIC KEY-----`
- `-----BEGIN EC PRIVATE KEY-----`

**Validation**: RFC 1421 format

**Limitations**:
- Requires complete BEGIN/END markers
- Partial PEM blocks not detected

## Network Patterns

### IPv4

**Pattern Type**: `ipv4`

**Description**: Detects IPv4 addresses.

**Base Confidence**: 0.80

**Regex**: Matches valid IPv4 octets (0-255)

**Examples**:
- `192.168.1.1`
- `10.0.0.1`
- `8.8.8.8`
- `255.255.255.255`

**Validation**:
- Each octet must be 0-255
- Excludes invalid values (e.g., 256.1.1.1)

**Limitations**:
- May match version numbers (e.g., 1.2.3.4)
- May match IP-like sequences in other contexts

---

### IPv6

**Pattern Type**: `ipv6`

**Description**: Detects IPv6 addresses.

**Base Confidence**: 0.80

**Examples**:
- `fe80::1`
- `2001:db8::1`
- `2001:0db8:85a3:0000:0000:8a2e:0370:7334`
- `::1`
- `::`

**Validation**: Standard IPv6 format including compressed notation

**Limitations**:
- May not detect all compressed formats
- Zone identifiers not supported

## Confidence Scoring

### How Confidence Works

1. Each pattern has a **base confidence** score
2. Validators can apply a **confidence multiplier**
3. Final confidence = base × multiplier (capped at 1.0)

### Confidence Interpretation

| Score | Interpretation |
|-------|----------------|
| 0.95 - 1.00 | Very high confidence (e.g., PEM blocks) |
| 0.85 - 0.94 | High confidence (e.g., validated emails) |
| 0.70 - 0.84 | Medium confidence (e.g., phone numbers) |
| 0.50 - 0.69 | Low confidence (potential false positive) |
| < 0.50 | Very low confidence (likely false positive) |

### Recommended Thresholds

| Use Case | Minimum Confidence |
|----------|-------------------|
| Blocking | 0.95 |
| Masking | 0.80 |
| Alerting | 0.50 |
| Logging | 0.30 |

## Custom Patterns

Custom patterns are not currently supported but planned for future releases.

**Workaround**: Fork the repository and modify `src/patterns/*.ts` files.

## Pattern Performance

### Detection Speed

| Text Length | Target Latency |
|-------------|----------------|
| 100-500 chars | <5ms |
| 500-1000 chars | <10ms |
| 1000-5000 chars | <20ms |

### Optimization

- Regex patterns are pre-compiled and cached
- Patterns are evaluated in parallel where possible
- Duplicate matches are deduplicated

## Reporting Issues

To report pattern issues:

1. **False Positives**: Provide the text that was incorrectly detected
2. **False Negatives**: Provide the text that should have been detected
3. **Include context**: Surrounding text, expected pattern type

Submit issues at: https://github.com/anomalyco/openclaw-guard/issues
