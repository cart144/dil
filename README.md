# DIL — Decision & Intent Language

DIL is a **deterministic specification language** designed to sit *on top of LLMs and coding agents*.

Its purpose is simple and strict:

> **Describe what must happen, verify what actually happened, and never confuse the two.**

DIL does not replace programming languages, scripts, or agents.
It **orchestrates**, **verifies**, and **audits** them.

---

## Why DIL Exists

When working with LLMs or autonomous coding agents:

* Execution is non-deterministic
* "Success" is inferred from text output
* Failures are ambiguous
* Reproducibility is weak
* Automation is fragile

DIL introduces a **hard verification layer**:

* Agents are free to act
* **Only verifiers decide correctness**
* Every run ends in a clear, explicit state

---

## Core Concepts

* **Intent** — what the system must achieve
* **Decision** — why a specific approach is allowed
* **Constraint** — what must never be violated
* **Validation** — a concrete, executable check
* **Gate** — an ordered group of validations that must pass

Agents may execute code, modify files, or start services.

**Truth is established exclusively by verification.**

---

## Deterministic Outcomes

Every DIL execution ends in exactly one state:

* `COMPLETED` — all gates verified
* `FAILED` — a deterministic validation failed
* `UNKNOWN` — the result cannot be determined

These states are:

* Printed to the terminal
* Persisted in artifacts
* Safe for automation and CI

---

## Installation

```bash
curl -fsSL https://raw.githubusercontent.com/cart144/dil/main/install.sh | bash
```

Verify:

```bash
dil --version
dil --help
```

---

## Quick Start

### 1. Validate a DIL specification

```bash
dil validate examples/example_valid_strict.dil
echo $?  # 0 = valid, 1 = invalid, 2 = undecidable
```

### 2. Verify execution constraints

```bash
dil verify examples/example_verify_demo.dil
```

This runs only the verifier. No agent is involved.

### 3. Execute with an LLM agent (Claude Code, non-interactive)

```bash
dil agent examples/example_agent_webapp_demo.dil -- \
  claude --dangerously-skip-permissions --output-format text -p "Build the app exactly as specified"
```

Claude Code flags explained:

* `--dangerously-skip-permissions` disables interactive permission prompts
* `--output-format text` ensures deterministic plain-text output
* `-p` runs Claude in print-only, non-interactive mode

DIL, not the LLM, determines success or failure.

### 4. Interpret results

Exit codes:

* `0` → COMPLETED
* `1` → FAILED
* `2` → UNKNOWN

Execution artifacts:

```
.dil/runs/<run-id>/
```

---

## Writing DIL Files

A `.dil` file declares **what** a system must do and **how** to verify it.

### Basic Structure

```dil
DIL:spec v0

system "MySystem.Name" {
  about {
    purpose: "What this spec is for."
    scope:   "Boundaries of the specification."
  }

  capabilities {
    # What the system is allowed to do
    declare_intents
    declare_constraints
    emit_structured_validation
  }

  intents {
    intent I1 "Intent Name" {
      statement: "What must be achieved."
      validations: [V1]
    }
  }

  constraints {
    constraint C1 "Constraint Name" {
      rule: "What must never be violated."
      severity: HARD
    }
  }

  decisions {
    decision D1 "Decision Name" {
      rationale: "Why this approach was chosen."
      supports: [I1]
      respects: [C1]
      supersedes: []
    }
  }

  validations {
    validate V1 "Validation Name" {
      target: intents.*
      predicate: "condition to check"
      on_fail: error {
        code: "ERROR_CODE"
        message: "Human-readable error message."
        refs: { intent: "${target.id}" }
      }
    }
  }
}
```

### Section Reference

| Section | Purpose |
|---------|---------|
| `about` | Metadata: purpose and scope |
| `capabilities` | Declares what the system can do |
| `intents` | **What** must be achieved |
| `constraints` | **What** must never be violated |
| `decisions` | **Why** specific approaches are allowed |
| `validations` | **How** to verify intents are satisfied |
| `change` | Conditions for future evolution (optional) |

### Key Rules

* Every **intent** must link to at least one **validation** (`validations: [V1]`)
* Every **decision** must support at least one **intent** and respect at least one **constraint**
* **Constraints** with `severity: HARD` cause immediate failure if violated
* **Validations** define the actual checks; agents cannot override them

### Formal Grammar

See [`spec/GRAMMAR_EBNF.md`](spec/GRAMMAR_EBNF.md) for the complete syntax specification.

---

## CLI Overview

DIL is installed as a system-level CLI.

```bash
dil <command> [options]
```

Available commands:

```bash
dil agent <spec.dil> -- <agent-command>
dil validate <spec.dil>
dil verify <spec.dil>
```

The user **never interacts with the agent directly**.
The agent is an implementation detail.

---

## Using DIL with LLMs

DIL is designed to be used **with non-interactive coding agents** (LLMs running in batch / automation mode), not as a chat interface.

The reference and currently supported agent is **Claude Code**.

DIL does **not** rely on natural language correctness. Instead:

* the agent performs actions (writes files, runs commands)
* DIL independently verifies outcomes through gates

### Example: Running DIL with Claude Code (Non-Interactive)

Claude Code provides two critical flags that make it suitable for deterministic execution:

* `--dangerously-skip-permissions` — disables interactive permission prompts
* `--output-format text` — forces plain text output (no UI framing)

A typical invocation looks like this:

```bash
dil agent example_agent_auth_demo.dil -- \
  claude \
    --dangerously-skip-permissions \
    --output-format text \
    -p "Work inside the repository. Implement the spec requirements. Ensure all gates pass."
```

What happens:

1. Claude Code runs **fully non-interactive**
2. It performs filesystem and command operations
3. DIL executes verification gates **independently**
4. The final result is derived *only* from verifier outcomes

Claude's own output is treated as **opaque** and **non-authoritative**.

### Why This Matters

Most LLM tooling mixes:

* reasoning
* execution
* success declaration

DIL intentionally separates them:

| Role              | Responsibility                      |
| ----------------- | ----------------------------------- |
| LLM (Claude Code) | Acts (writes code, runs commands)   |
| DIL               | Verifies outcomes deterministically |

This allows:

* retries on transient agent failures
* hard stops on deterministic verification failures
* auditable, replayable runs

DIL can support other agents **only if** they support:

* non-interactive execution
* deterministic CLI invocation
* filesystem + process access

---

## Execution Flow

```text
DIL Execution Flow (Verified Orchestration)
──────────────────────────────────────────────────────────────────────

           ┌───────────────────────────────┐
           │           spec.dil            │
           │  (intents, decisions, gates)  │
           └───────────────┬───────────────┘
                           │
                           │  dil agent spec.dil -- <agent-cmd>
                           ▼
           ┌───────────────────────────────┐
           │         DIL Orchestrator       │
           │  - discovers gates V_GATE_NN_  │
           │  - runs in strict order        │
           │  - retries only transient      │
           └───────────────┬───────────────┘
                           │
                           │  (agent runs commands / edits files)
                           ▼
           ┌───────────────────────────────┐
           │          Agent Executor        │
           │  e.g. Claude Code, etc.        │
           │  - MAY change filesystem       │
           │  - MUST NOT declare truth      │
           └───────────────┬───────────────┘
                           │
                           │  (truth comes from verifier only)
                           ▼
           ┌───────────────────────────────┐
           │           DIL Verifier         │
           │  - executes validations        │
           │  - outputs PASSED/FAILED/UNK   │
           └───────────────┬───────────────┘
                           │
                           │  exit codes + receipts
                           ▼
     ┌──────────────────────────────┬───────────────────────────────┐
     │ Terminal Output (primary)     │ Artifacts (audit trail)        │
     │ - gate-by-gate status         │ .dil/runs/<run-id>/            │
     │ - retries + reasons           │ - run_receipt.json             │
     │ - final state                 │ - verification.json            │
     └──────────────────────────────┴───────────────────────────────┘

Final execution state:
  COMPLETED (exit 0)  → all gates VERIFIED
  FAILED    (exit 1)  → deterministic failure
  UNKNOWN   (exit 2)  → cannot determine outcome (classified)
```

---

## Examples

The repository includes:

* Valid and invalid `.dil` specifications
* Undecidable cases
* Agent-driven demos

See the `examples/` and `demos/` directories.

---

## Philosophy

DIL is intentionally:

* Boring
* Explicit
* Verifiable
* Hostile to hand-waving

If a system claims success, it must **prove it**.

---

## Status

DIL is **early but functional**.

* Language semantics are defined
* Validator and verifier are implemented
* CLI UX contract is enforced
* Global installer is available

Expect iteration — not ambiguity.

---

## License

Apache License 2.0
