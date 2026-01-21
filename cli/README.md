# DIL Gate CLI

Minimal CLI for DIL validation receipts and guarded execution.

## Build

```bash
cd /var/lib/dil/cli
npm install
npm run build
```

## Commands

### validate

Runs the reference validator on a spec file and writes a validation receipt.

```bash
node dist/index.js validate <specPath> [--out <receiptPath>]
```

**Arguments:**
- `<specPath>` - Path to the .dil spec file
- `--out <receiptPath>` - Optional. Path to write the receipt. If not provided, writes to `/var/lib/dil/.dil/receipts/<specHash>.validation.json`

**Exit codes:**
- `0` - VALID
- `1` - INVALID
- `2` - UNDECIDABLE

**Output:**
- Prints the receipt path to stdout on success
- Errors go to stderr

**Example:**
```bash
# Validate and use default receipt location
node dist/index.js validate /var/lib/dil/example_valid_strict.dil

# Validate with custom receipt location
node dist/index.js validate /var/lib/dil/example_valid_strict.dil --out /tmp/receipt.json
```

### verify

Runs runtime verification checks against system state as declared in the spec file.

```bash
node dist/index.js verify <specPath> [--out <path>] [--only-check-prefix <prefix>]... [--only-check-ids <id1,id2,...>]
```

**Arguments:**
- `<specPath>` - Path to the .dil spec file
- `--out <path>` - Optional. Path to write the verification receipt. If not provided, writes to `/var/lib/dil/.dil/verification/<specHash>.verification.json`
- `--only-check-prefix <prefix>` - Optional. Only run checks with IDs starting with this prefix. Can be specified multiple times.
- `--only-check-ids <id1,id2,...>` - Optional. Only run checks with these exact IDs (comma-separated).

**Exit codes:**
- `0` - VERIFIED (all applicable checks passed)
- `1` - UNVERIFIED (at least one check failed)
- `2` - UNKNOWN (no failures, but at least one check could not determine state)

**Output:**
- Prints the verification receipt path to stdout on success
- Errors go to stderr

**Supported verification capabilities:**
- `check_file_exists` - Verify file/directory existence and properties
- `check_command_exit` - Verify command produces expected exit code
- `check_http_endpoint` - Verify HTTP endpoint responds with expected status

**Example:**
```bash
# Verify system state against spec
node dist/index.js verify /var/lib/dil/example_with_checks.dil

# Verify with custom receipt location
node dist/index.js verify /var/lib/dil/example_with_checks.dil --out /tmp/verification.json

# Verify only checks starting with V_GATE_01_
node dist/index.js verify /var/lib/dil/example_agent_webapp_demo.dil --only-check-prefix V_GATE_01_

# Verify specific check IDs
node dist/index.js verify /var/lib/dil/example_agent_webapp_demo.dil --only-check-ids V_GATE_01_FILE_HTML,V_GATE_01_FILE_CSS
```

### run

Validates a spec file and, if valid, executes a command with DIL environment variables.

```bash
node dist/index.js run <specPath> -- <command...>
```

**Arguments:**
- `<specPath>` - Path to the .dil spec file
- `--` - Separator (required)
- `<command...>` - Command and arguments to execute

**Behavior:**
1. Runs `dil validate` to produce a receipt
2. If validation fails (exit code != 0), does NOT execute the command and exits with the validator's exit code
3. If validation succeeds (exit code == 0), executes the command with:
   - `DIL_SPEC_PATH` environment variable set to the spec path
   - `DIL_RECEIPT_PATH` environment variable set to the receipt path
4. Captures command stdout/stderr to log files under `/var/lib/dil/.dil/runs/<runId>/`
5. Exits with the executed command's exit code

**Output:**
- Prints the receipt path to stdout
- Command stdout/stderr are captured to files, not printed

**Example:**
```bash
# Run a command if spec is valid
node dist/index.js run /var/lib/dil/example_valid_strict.dil -- echo "Spec is valid"

# Command blocked if spec is invalid
node dist/index.js run /var/lib/dil/example_invalid.dil -- echo "SHOULD_NOT_RUN"
```

### agent

Validates a spec file, invokes a command with the spec context, and verifies the result.

```bash
node dist/index.js agent <specPath> -- <cmd> <args...>
```

**Arguments:**
- `<specPath>` - Path to the .dil spec file
- `--` - Separator (required)
- `<cmd>` - Command to invoke (currently only `claude`)
- `<args...>` - Arguments passed to the command

**Claude-specific requirements:**
- Must use print mode: `-p` or `--print` flag is required
- Prompt must be a single quoted argument (see Troubleshooting)
- `--output-format text` is added automatically if not specified

**Behavior:**
1. Validates the spec; blocks if invalid/undecidable
2. Creates deterministic run directory based on spec hash and command hash
3. Detects gates from validation IDs (see Gated Execution below)
4. Pre-creates lifecycle files (`agent.started`, `agent.exit_code`, `agent.finished`)
5. Invokes the command (30 minute timeout with graceful SIGTERM → 2s → SIGKILL)
6. Streams stdout/stderr to log files in real-time
7. Prints progress every 2 seconds to stderr
8. Detects if spec was modified during execution
9. Runs verification after command completes (per-gate if gated)
10. Writes run receipt with final state

**Gated Execution:**

If the spec contains validation IDs matching the pattern `V_GATE_NN_*` (where NN is a zero-padded number like 01, 02), the agent runs in gated multi-pass mode:

1. Gates are processed in numeric order (01 → 02 → 03 → ...)
2. For each gate:
   - Runs the agent command
   - Verifies only checks matching that gate's prefix (e.g., `V_GATE_01_*`)
   - **Smart retry policy**: Only transient failures are retried (up to 3 attempts):
     - `agent_crash_no_messages` - Claude crashed
     - `agent_timeout` - Exceeded timeout
     - `unknown_transient` - Unknown state
   - **Deterministic failures are NOT retried**: If verification explicitly fails, the gate fails immediately
   - If gate fails after all retries, stops (doesn't proceed to next gate)
3. If all gates pass, runs final full verification

Gate information is available to the agent via environment variables:
- `DIL_CURRENT_GATE` - Current gate prefix (e.g., `V_GATE_01_`)
- `DIL_GATE_ATTEMPT` - Current attempt number (1, 2, or 3)

Each pass creates separate log files:
- `agent.gateNN.passM.stdout.log`
- `agent.gateNN.passM.stderr.log`
- `verification.gateNN.passM.json`

**Exit codes:**
- If blocked: same as validation (1=INVALID, 2=UNDECIDABLE)
- If spec changed during run: 2 (UNKNOWN)
- If spec unchanged: same as verification (0=VERIFIED, 1=UNVERIFIED, 2=UNKNOWN)

**Output:**
- Prints the run directory path to stdout
- Progress and logs to stderr

**Example:**
```bash
# Invoke claude on a spec (prompt must be quoted!)
node dist/index.js agent /var/lib/dil/example_valid_strict.dil -- claude -p "Implement this spec"
```

## Directory Structure

```
/var/lib/dil/.dil/
  receipts/
    <specHash>.validation.json    # Validation receipts
  verification/
    <specHash>.verification.json  # Verification receipts
  runs/
    <runId>/
      receipt.path                # Path to the validation receipt (run command)
      executor.stdout.log         # Command stdout (run command)
      executor.stderr.log         # Command stderr (run command)
      agent_request.json          # Context provided to command (agent command)
      agent.exit_code             # Command exit code (agent command)
      agent.started               # Lifecycle marker: agent started
      agent.finished              # Lifecycle marker: agent finished (contains exit code)
      verification.json           # Final verification receipt (agent command)
      run_receipt.json            # Final run metadata (agent command)
      # Single-pass mode files:
      agent.pass1.stdout.log      # Command stdout
      agent.pass1.stderr.log      # Command stderr
      verification.pass1.json     # Verification receipt
      # Gated mode files (per gate, per attempt):
      agent.gate01.pass1.stdout.log   # Gate 01, attempt 1 stdout
      agent.gate01.pass1.stderr.log   # Gate 01, attempt 1 stderr
      verification.gate01.pass1.json  # Gate 01, attempt 1 verification
      agent.gate01.pass2.stdout.log   # Gate 01, attempt 2 (if retry)
      # etc.
```

## Troubleshooting

### Quoting the prompt for `claude -p`

The prompt must be passed as a **single quoted argument**. The shell splits unquoted words into separate arguments, which causes `dil agent` to fail.

**Correct:**
```bash
# Double quotes (recommended)
node dist/index.js agent spec.dil -- claude -p "say hello world"

# Single quotes
node dist/index.js agent spec.dil -- claude -p 'say hello world'
```

**Wrong:**
```bash
# Unquoted - will fail with "prompt must be a single quoted argument"
node dist/index.js agent spec.dil -- claude -p say hello world
```

### Where to find logs

All agent run artifacts are stored in `/var/lib/dil/.dil/runs/<runId>/`:

| File | Description |
|------|-------------|
| `agent.passN.stdout.log` | Pass N stdout (streamed in real-time) |
| `agent.passN.stderr.log` | Pass N stderr (streamed in real-time) |
| `agent.gateNN.passM.*` | Gated mode: gate NN, attempt M logs |
| `agent.exit_code` | Final agent exit code (or `-1` if still running/crashed) |
| `agent.started` | Contains `started` when agent begins |
| `agent.finished` | Contains final exit code when agent completes |
| `agent_request.json` | Input context provided to the agent |
| `verification.json` | Final verification receipt |
| `run_receipt.json` | Final run receipt with verification state and gate results |

To watch logs in real-time:
```bash
# Single-pass mode
tail -f /var/lib/dil/.dil/runs/<runId>/agent.pass1.stderr.log

# Gated mode (watching gate 01)
tail -f /var/lib/dil/.dil/runs/<runId>/agent.gate01.pass*.stderr.log
```

### What `agent.exit_code = -1` means

If `agent.exit_code` contains `-1`, it means:
- The agent process was started but has not yet completed, OR
- The `dil agent` process crashed before it could write the final exit code

Check `agent.finished`:
- If `agent.finished` does not exist: the run did not complete normally
- If `agent.finished` exists: run completed, check its contents for the final exit code

### Mini test: verify logs are populated

Run this command to test that `claude` output is captured:

```bash
# Run a simple claude command
RUN_DIR=$(node dist/index.js agent /var/lib/dil/example_verify_demo.dil -- claude -p "say OK")

# Check the output
echo "Run directory: $RUN_DIR"
cat "$RUN_DIR/agent.stdout.log"
cat "$RUN_DIR/agent.exit_code"
cat "$RUN_DIR/agent.finished"
```

Expected output:
- `agent.pass1.stdout.log` should contain the claude response (e.g., "OK")
- `agent.exit_code` should contain `0`
- `agent.finished` should contain the final exit code

## Gate Naming Convention

To enable gated multi-pass execution, name your validation IDs with the pattern `V_GATE_NN_<name>`:

```dil
validations {
  // Gate 01: Basic file existence checks
  validate V_GATE_01_FILE_HTML "index.html must exist" { ... }
  validate V_GATE_01_FILE_CSS "style.css must exist" { ... }
  validate V_GATE_01_FILE_JS "app.js must exist" { ... }

  // Gate 02: Syntax validation (depends on files existing)
  validate V_GATE_02_JS_SYNTAX "app.js must pass syntax check" { ... }

  // Gate 03: Integration tests (depends on syntax being valid)
  validate V_GATE_03_TESTS_PASS "Tests must pass" { ... }
}
```

The agent will:
1. Run and verify Gate 01 (all `V_GATE_01_*` validations)
2. Only if Gate 01 passes, run and verify Gate 02
3. Only if Gate 02 passes, run and verify Gate 03
4. etc.

See `/var/lib/dil/example_agent_webapp_demo.dil` for a complete example.

## Claude Code – "No messages returned" Handling

### What the error means

Claude Code sometimes crashes with the error:
```
Error: No messages returned
```

This typically indicates an internal failure in Claude Code where the API returned an empty response. This is a **transient failure** that may succeed on retry.

### How DIL reacts

When the DIL agent detects this error in Claude's stderr output:

1. **Immediate classification**: The failure is classified as `agent_crash_no_messages`
2. **Crash marker**: A clear marker is appended to the stderr log:
   ```
   [DIL AGENT CRASH] Detected fatal error: "No messages returned"
   ```
3. **Smart retry**: For gated execution, the same gate is retried (up to 3 attempts total)
4. **No blind retry**: Deterministic verification failures (`verification_failed`) are NOT retried
5. **Proper exit**: The agent loop terminates cleanly with all lifecycle files written

### Failure classification

The DIL agent classifies failures into these categories:

| Failure Kind | Description | Retryable? |
|--------------|-------------|------------|
| `agent_crash_no_messages` | Claude crashed with "No messages returned" | Yes |
| `agent_timeout` | Agent exceeded 30 minute timeout | Yes |
| `unknown_transient` | Unknown failure that may be transient | Yes |
| `verification_failed` | Deterministic verification failure | **No** |
| `none` | No failure (success) | N/A |

### Where logs are written

When a crash is detected:
- `agent.passN.stderr.log` or `agent.gateNN.passM.stderr.log` - Contains the original stderr output plus the crash marker
- `run_receipt.json` - Contains detailed attempt tracking with `failure_kind` for each attempt

### Gate attempt tracking in run_receipt.json

For gated execution, the run receipt now includes detailed attempt information:

```json
{
  "gated_execution": {
    "gate_results": [
      {
        "gate_prefix": "V_GATE_01_",
        "total_attempts": 2,
        "final_status": "passed",
        "final_failure_kind": "none",
        "attempts": [
          {
            "attempt_number": 1,
            "gate_status": "agent_crash",
            "failure_kind": "agent_crash_no_messages",
            "retry_reason": "transient failure: agent_crash_no_messages",
            "verification_state": "unknown",
            "spawn_exit_code": 1
          },
          {
            "attempt_number": 2,
            "gate_status": "passed",
            "failure_kind": "none",
            "retry_reason": null,
            "verification_state": "verified",
            "spawn_exit_code": 0
          }
        ]
      }
    ]
  }
}
```

### Testing with DIL_TEST_FORCE_NO_MESSAGES

For testing purposes, you can simulate the "No messages returned" crash using an environment variable:

```bash
# Set the test hook to simulate the crash
DIL_TEST_FORCE_NO_MESSAGES=1 node dist/index.js agent /var/lib/dil/example_verify_demo.dil -- claude -p "test"
```

When this variable is set to `1`:
- The agent will **not** actually spawn Claude
- Instead, it simulates a crash with "Error: No messages returned" in stderr
- The failure classification and retry logic will execute as if a real crash occurred

**Note**: This is for development/testing only. The test hook should not be used in production.
