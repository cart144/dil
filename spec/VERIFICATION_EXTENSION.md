# VERIFICATION_EXTENSION.md

DIL:verify v0 — Runtime Verification of System State Against Declared Intents

---

## 1. Purpose

Verification answers: **"Does the actual system state match declared intents?"**

This complements the existing DIL toolchain:

| Phase | Question | Artifact |
|-------|----------|----------|
| **Validate** | Does the .dil spec follow DIL rules? | `*.validation.json` |
| **Execute** | Run the system according to the spec | (system artifacts) |
| **Verify** | Does post-execution state match intents? | `*.verification.json` |

Validation is static analysis of the specification. Verification is runtime inspection of actual system state. A spec can be VALID yet the system may be UNVERIFIED if execution failed or produced incorrect results.

---

## 2. Execution Model

```
validate → execute → verify
```

**Sequencing constraints:**

1. Validation MUST complete successfully before execution begins
2. Execution produces system artifacts (files, services, state changes)
3. Verification checks post-execution state against declared intents
4. Each phase produces a separate receipt

**Receipt separation:**

- Validation receipt: `*.validation.json` (spec correctness)
- Verification receipt: `*.verification.json` (state conformance)

These are distinct artifacts. A system may have a VALID spec but UNVERIFIED state, or vice versa (though the latter indicates a toolchain bug).

---

## 3. Supported Capabilities (Initial Allowlist)

| Capability | Purpose |
|------------|---------|
| `check_file_exists` | Verify file/directory existence and properties |
| `check_command_exit` | Verify command produces expected exit code |
| `check_http_endpoint` | Verify HTTP endpoint responds as expected |

Capabilities MUST be declared in the spec's `capabilities` block to be used in verification checks. Using an undeclared capability results in `unknown` status.

---

## 4. Capability Semantics

### 4.1 check_file_exists

Verifies that a filesystem path exists with expected properties.

**Parameters:**

| Key | Required | Type | Description |
|-----|----------|------|-------------|
| `path` | Yes | string | Absolute path to check |
| `type` | No | `file` \| `directory` | Expected path type |
| `min_size_bytes` | No | integer | Minimum size in bytes (files only) |

**Outcomes:**

- **Success:** Path exists, type matches (if specified), size meets minimum (if specified)
- **Failure:** Path does not exist, type mismatch, size below minimum
- **Unknown:** Permission denied, filesystem error, path not absolute

**Notes:**

- Symbolic links are followed
- Size check is ignored for directories
- Empty files satisfy `min_size_bytes=0`

### 4.2 check_command_exit

Verifies that a command produces an expected exit code.

**Parameters:**

| Key | Required | Type | Description |
|-----|----------|------|-------------|
| `cmd` | Yes | string | Command name or absolute path |
| `args` | Yes | string | Comma-separated argument tokens |
| `expected_exit` | No | integer | Expected exit code (default: 0) |
| `timeout_ms` | No | integer | Timeout in milliseconds (default: 30000) |

**Outcomes:**

- **Success:** Command exits with expected code within timeout
- **Failure:** Exit code mismatch, command not found
- **Unknown:** Timeout exceeded, cannot spawn process, permission denied

**Security constraints:**

- No shell expansion (command is exec'd directly)
- No pipes, redirects, or command chaining
- Arguments are literal tokens, not shell-interpreted
- Command MUST be found in PATH or be an absolute path

**Notes:**

- `args` may be empty string for commands with no arguments
- stdout/stderr are captured but not validated (use for evidence only)

### 4.3 check_http_endpoint

Verifies that an HTTP endpoint responds with expected status.

**Parameters:**

| Key | Required | Type | Description |
|-----|----------|------|-------------|
| `url` | Yes | string | Full URL including scheme |
| `method` | No | `GET` \| `HEAD` | HTTP method (default: GET) |
| `expected_status` | No | integer | Expected HTTP status code (default: 200) |
| `timeout_ms` | No | integer | Timeout in milliseconds (default: 5000) |

**Outcomes:**

- **Success:** Response status matches expected
- **Failure:** Status mismatch, connection refused, host unreachable
- **Unknown:** Timeout exceeded, DNS failure, TLS error, network unreachable

**Security constraints:**

- HTTP and HTTPS schemes only (no file://, ftp://, etc.)
- GET and HEAD methods only (no POST, PUT, DELETE, etc.)
- No request body
- No custom headers
- Redirects are NOT followed (3xx is a distinct status)

**Notes:**

- Response body is not validated
- TLS certificate errors result in `unknown`, not `failure`

---

## 5. Check Parameter Encoding in DIL

Verification checks are encoded within validation predicates as opaque quoted strings. This encoding does NOT modify DIL core grammar.

**Format:**

```
"<capability_name> key=value key=value ..."
```

The capability name is the full name (e.g., `check_file_exists`).

**Examples:**

```
"check_file_exists path=/var/log/app.log type=file min_size_bytes=0"
```

```
"check_command_exit cmd=npm args=run,build expected_exit=0 timeout_ms=600000"
```

```
"check_http_endpoint url=http://127.0.0.1:3000/health method=GET expected_status=200 timeout_ms=5000"
```

**Parsing rules (tolerant-but-non-inventive):**

1. First token identifies the capability (must be full capability name)
2. Remaining tokens are `key=value` pairs separated by whitespace
3. Values containing spaces are not supported (use URL encoding if needed)
4. Unknown keys → `unknown` status (reason: `unknown_key:<key>`)
5. Missing required keys → `unknown` status
6. Malformed syntax → `unknown` status

**Argument encoding for `args`:**

- Arguments are comma-separated tokens
- Each token is passed as a literal argument
- Empty string (`args=`) means no arguments
- Example: `args=run,build,--verbose` → `["run", "build", "--verbose"]`

---

## 6. Verification Receipt Structure

The verification receipt is deterministic JSON. Given identical inputs and system state, the receipt MUST be byte-identical.

**Top-level structure:**

```json
{
  "receipt_type": "verification",
  "receipt_version": "DIL:verify v0",
  "spec_version": "DIL:spec v0",
  "system_id": "<opaque-identifier>",
  "validation_receipt_ref": "<path-or-hash>",
  "state": "verified" | "unverified" | "unknown",
  "checks": [ ... ]
}
```

**Field definitions:**

| Field | Type | Description |
|-------|------|-------------|
| `receipt_type` | string | Always `"verification"` |
| `receipt_version` | string | Version of verification spec |
| `spec_version` | string | Version of DIL spec being verified |
| `system_id` | string | Identifier for the system under verification |
| `validation_receipt_ref` | string | Reference to prior validation receipt |
| `state` | enum | Aggregate verification state |
| `checks` | array | Individual check results |

**Check structure:**

```json
{
  "check_id": "<artifact-id>",
  "capability": "check_file_exists" | "check_command_exit" | "check_http_endpoint",
  "status": "passed" | "failed" | "unknown" | "skipped",
  "reason": "<string>",
  "evidence": { ... }
}
```

**Check field definitions:**

| Field | Required | Description |
|-------|----------|-------------|
| `check_id` | Yes | Identifier linking to spec artifact |
| `capability` | Yes | Which capability was invoked |
| `status` | Yes | Outcome of the check |
| `reason` | Conditional | Required when status is `failed` or `unknown` |
| `evidence` | No | Structured data supporting the status |

**Status values:**

- `passed` — Check succeeded, state matches intent
- `failed` — Check completed, state does not match intent
- `unknown` — Check could not determine state (includes: capability not declared, capability not supported)
- `skipped` — Reserved for future explicit opt-out mechanisms (not used in v0)

**Determinism requirements:**

- No timestamp fields (receipts must be reproducible)
- `checks` array ordered by `check_id` (lexicographic sort)
- Object keys sorted alphabetically
- No floating-point numbers (use integers or strings)
- UTF-8 encoding, no BOM

**Exit codes:**

| Code | State | Meaning |
|------|-------|---------|
| 0 | `verified` | All checks passed |
| 1 | `unverified` | At least one check failed |
| 2 | `unknown` | No failures, but at least one unknown |

---

## 7. Non-Goals

This specification explicitly does NOT provide:

**No scripting language.** Checks are declarative assertions, not programs. There are no variables, conditionals, or loops within checks.

**No arbitrary shell execution.** Commands are exec'd directly without shell interpretation. No pipes, redirects, subshells, or command chaining.

**No retries or polling.** Each check runs exactly once. If transient failures are a concern, the caller must implement retry logic externally.

**No CI/CD replacement.** Verification is a point-in-time state check. It does not orchestrate workflows, manage dependencies, or coordinate parallel execution.

**No automatic remediation.** Verification reports state; it does not modify it. An `unverified` result requires external intervention.

**No complex assertions.** Checks support exact matching only:
- No regular expressions
- No JSON path queries
- No arithmetic beyond size comparison and status codes
- No response body inspection

**No network authentication.** HTTP checks do not support:
- Authentication headers
- Client certificates
- Cookie jars
- Session management

---

## 8. Relationship with UNDECIDABLE/Unknown

### 8.1 State Aggregation

The aggregate `state` is computed from individual check statuses:

1. If ANY check has `status: "failed"` → `state: "unverified"`
2. Else if ANY check has `status: "unknown"` → `state: "unknown"`
3. Else all `passed` → `state: "verified"`

This mirrors DIL validation's aggregation logic where INVALID takes precedence over UNDECIDABLE.

### 8.2 Conditions Producing Unknown

A check results in `unknown` when the verifier cannot determine pass/fail:

**Capability errors:**
- Capability not declared in spec
- Capability name not in allowlist

**Parameter errors:**
- Required key missing
- Value malformed (e.g., non-integer for `timeout_ms`)
- Path not absolute (for `check_file_exists`)

**Runtime errors:**
- Timeout exceeded
- Permission denied
- Network unreachable
- DNS resolution failure
- TLS handshake failure
- Resource exhaustion (fd limits, memory)
- Process spawn failure

### 8.3 Semantic Distinction

**`unknown` is NOT `unverified`.**

- `unverified` means: "We checked and the state is wrong"
- `unknown` means: "We could not check; insufficient information"

This distinction is critical for correct interpretation:

| State | Confidence | Action |
|-------|------------|--------|
| `verified` | High | State matches intent |
| `unverified` | High | State does not match intent |
| `unknown` | Low | Cannot determine; investigate |

An `unknown` result may become `verified` or `unverified` once the blocking condition is resolved (permissions granted, network restored, timeout increased).

### 8.4 Consistency with DIL Semantics

This three-valued logic is consistent with DIL's VALID/INVALID/UNDECIDABLE model:

| Validation | Verification | Meaning |
|------------|--------------|---------|
| VALID | verified | Spec correct, state correct |
| VALID | unverified | Spec correct, state incorrect |
| VALID | unknown | Spec correct, state unknown |
| INVALID | — | Spec incorrect, verification skipped |
| UNDECIDABLE | — | Spec indeterminate, verification skipped |

Verification SHOULD only proceed after VALID validation. Running verification against an INVALID or UNDECIDABLE spec is undefined behavior.

---

## Appendix: Evidence Schemas

Evidence structures are capability-specific and optional. When present, they provide additional context for debugging.

### check_file_exists evidence

```json
{
  "actual_type": "file" | "directory" | "symlink" | "other",
  "actual_size_bytes": 12345,
  "exists": true | false
}
```

### check_command_exit evidence

```json
{
  "actual_exit": 1,
  "stdout_truncated": "first 1024 bytes...",
  "stderr_truncated": "first 1024 bytes..."
}
```

### check_http_endpoint evidence

```json
{
  "actual_status": 404,
  "response_time_ms": 127
}
```

Evidence is NOT used for pass/fail determination. It is informational only.
