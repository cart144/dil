# DIL CLI UX Contract — v1

## Purpose

`dil agent` is a **deterministic orchestration command** that executes a DIL specification using one or more agents (LLMs or other executors), while guaranteeing:

- verifiable execution
- clear final states
- full auditability
- repeatable behavior

The user **interacts only with DIL**, never directly with the agent.

---

## Core Principle

> **If the user only reads the terminal output, they must fully understand what happened.**

JSON artifacts are secondary. The CLI output is the primary source of truth.

---

## Canonical Command Form

```bash
dil agent <spec.dil> [options] -- <agent-command>
```

Example:

```bash
dil agent auth-demo.dil -- claude -p "..."
```

---

## Global Execution States (Immutable)

Every execution always ends in **exactly one** of the following states:

- `COMPLETED` — all gates verified
- `FAILED` — at least one gate failed deterministically
- `UNKNOWN` — result cannot be determined

These states:

- are mutually exclusive
- are always printed to the terminal
- are always persisted in `run_receipt.json`

---

## Gate Model

- Gates are identified by validation ID prefix: `V_GATE_NN_`
- Gates are executed strictly in numeric order
- A gate blocks execution of subsequent gates if it does not pass

Minimal guaranteed CLI output:

```
dil agent: detected 4 gate(s)
dil agent: gate 01: running
dil agent: gate 01: PASSED (1.3s)
dil agent: gate 02: running (attempt 1/3)
```

---

## Gate States

Each gate may terminate in one of the following states:

- `PASSED`
- `FAILED`
- `UNKNOWN`

### FAILED

- Deterministic failure
- No retries
- Execution stops immediately

### UNKNOWN

- Must be explicitly classified
- Retry behavior depends on classification

---

## UNKNOWN Classification (Mandatory)

Every `UNKNOWN` outcome **must belong to exactly one category**:

| Category                 | Retry | Meaning                            |
| ------------------------ | ----- | ---------------------------------- |
| `unknown_verifier_limit` | ❌     | Spec exceeds verifier capabilities |
| `unknown_agent_crash`    | ✅     | Agent process crashed              |
| `unknown_transient`      | ✅     | Temporary failure                  |
| `unknown_internal`       | ❌     | Internal DIL error                 |

Required CLI output:

```
gate 02: UNKNOWN (verifier_limit)
reason: predicate contains unsupported tokens
```

---

## Retry Contract

- Retries are **explicit**, never implicit
- Retries are allowed only for:
  - `unknown_agent_crash`
  - `unknown_transient`
- Default maximum retries: **3** (configurable)

Each retry must be announced:

```
gate 02: UNKNOWN (agent_crash)
retrying gate 02 (attempt 2/3)
```

---

## Progressive Output (Anti-Freeze)

During long-running executions, the CLI must emit periodic progress output:

```
dil agent: running (pid=12345, gate=02, attempt=1)
```

- Frequency: \~2 seconds
- Prolonged silence is considered a bug

---

## Agent Responsibility Contract

The agent:

- does **not** decide correctness
- does **not** declare success
- does **not** control execution flow

The agent may:

- modify the filesystem
- execute commands
- emit optional textual output

**Truth is established exclusively by the DIL verifier.**

---

## Guaranteed Artifacts

Every run always produces the following artifacts:

```
.dil/runs/<run-id>/
├─ agent.started
├─ agent.exit_code
├─ agent.finished
├─ run_receipt.json
├─ verification.json
├─ agent.gateNN.passM.stdout.log
├─ agent.gateNN.passM.stderr.log
```

No exceptions.

---

## CLI Exit Codes

| Exit Code | Meaning   |
| --------- | --------- |
| `0`       | COMPLETED |
| `1`       | FAILED    |
| `2`       | UNKNOWN   |

Automation-safe and unambiguous.

---

## Explicit Non-Goals

The CLI does **not**:

- infer truth from agent output
- guess intent
- hide errors
- continue after deterministic failures

---

## Final Philosophy

`dil agent` is **not** a chat, **not** a script, **not** an LLM wrapper.

It is a **verified execution protocol** with a CLI designed to be:

- boring
- predictable
- brutally clear

This is precisely what makes it suitable as a system-level tool.

