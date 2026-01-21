# LLM_CONTRACT.md

## Purpose

This document defines the **non‑negotiable contract** between DIL and Large Language Models (LLMs).

It exists to prevent semantic drift, hallucination, silent inference, and role confusion.

DIL is **not** a programming language and **not** an instruction set for execution.
It is a **control surface** for intent, constraints, and decision traceability.

---

## Canonical Roles

### 1. Author (Human or AI‑Assisted)

**Responsibilities**:
- Declare intents, constraints, decisions, and validations in DIL
- Own the meaning and scope of the specification
- Accept that specifications may be intentionally incomplete

**Explicitly NOT allowed**:
- Delegating intent definition to an LLM without review
- Treating DIL as auto‑completable or self‑healing

---

### 2. Interpreter (LLM)

An LLM may read and reason about DIL, but it is **never authoritative**.

**Allowed behaviors**:
- Explain what the specification states
- Identify missing information
- Describe conditional plans ("if validated, then…")
- Surface ambiguity as structured questions

**Forbidden behaviors**:
- Inferring missing constraints, capabilities, or intents
- Completing or rewriting the specification
- Optimizing, refactoring, or “improving” intents
- Assuming execution semantics

> An LLM must treat DIL as immutable input, not a draft.

---

### 3. Validator (Tool)

The validator is the **only authority** that can classify a DIL specification as:
- `valid`
- `invalid`
- `undecidable`

**Properties**:
- Deterministic
- Non‑probabilistic
- Side‑effect free

LLMs MUST NOT emulate, approximate, or replace validation logic.

---

### 4. Executor (Agent / System)

The executor acts **only after validation** and **outside of DIL**.

**Key rule**:
> Execution is downstream of DIL, never embedded within it.

Executors may:
- Consume validated decisions
- Refuse to act if validation is not `valid`

Executors must NOT:
- Interpret undecidable specs as permission to guess
- Modify DIL artifacts

---

## Input Contract for LLMs

When an LLM is given a DIL specification:

- Missing information is **intentional unless proven otherwise**
- Absence of capability or evidence **does not authorize inference**
- `undecidable` is a first‑class outcome, not an error

LLMs must not assume:
- External systems
- Implicit best practices
- Industry defaults
- Hidden execution environments

---

## Output Contract for LLMs

LLM output derived from DIL may include:
- Explanations
- Risk analysis
- Structured clarification requests
- Conditional reasoning trees

LLM output must NOT include:
- Executable code presented as DIL‑compliant
- Decisions lacking explicit traceability
- Actions not justified by validated decisions

---

## Canonical Failure Modes (and How DIL Handles Them)

| LLM Failure Mode | Description | DIL Response |
|-----------------|-------------|--------------|
| Hallucinated Capability | LLM assumes missing capability | `undecidable` |
| Silent Assumption | LLM fills missing info | `invalid` |
| Helpful Completion | LLM adds logic or structure | V‑M5 violation |
| Best‑Practice Injection | LLM enforces norms | Implementation Leak |
| Execution Guessing | LLM plans actions | Out of scope |

---

## DIL Is Not

DIL is **not**:
- A programming language
- A workflow engine
- A policy DSL
- Turing‑complete
- Self‑executing

Any attempt to use DIL as such is a contract violation.

---

## Core Principle

> **DIL constrains what MAY be planned or executed.**  
> It never prescribes **how** execution occurs.

LLMs that respect this boundary are safe to use with DIL.
LLMs that cross it must be treated as untrusted.

---

## Compliance Statement

Any system claiming DIL compatibility MUST:
- Treat this contract as normative
- Enforce validator authority
- Reject LLM outputs that violate these rules

Failure to do so invalidates any claim of DIL conformance.

