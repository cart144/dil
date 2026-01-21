# GOVERNANCE.md

## Purpose

This document defines the **governance model of DIL**.

Its goal is to protect the semantic integrity of the language over time, prevent accidental drift, and block unreviewed or implicit changes — especially those introduced via tools, LLMs, or convenience-driven evolution.

Governance in DIL exists to answer one question:

> **Who is allowed to change meaning, and how?**

---

## Core Principle

> **Semantics are harder to change than syntax.**

Any change that alters meaning is a first‑class decision and must be treated as such.

---

## Normative Artifacts

The following files are **normative**. Any change to them is a semantic change unless explicitly stated otherwise:

- FOUNDATION.md
- ARTIFACT_MODEL.md
- VALIDATION.md
- ERROR_CODES.md
- CANONICAL_REPORT_SCHEMA.md
- LLM_CONTRACT.md
- GOVERNANCE.md

The test corpus (`example*.dil` + `expected_*.json`) is also normative.

---

## Decision Log

All semantic changes MUST be recorded in a decision log.

### Required File

- `DECISIONS.md`

Each entry MUST include:
- Decision ID
- Date
- Motivation
- Description of the change
- Impacted artifacts
- Backward compatibility status
n
No decision log entry → no valid change.

---

## Change Classification

All changes fall into exactly one category.

### 1. Editorial Changes

Examples:
- Typos
- Formatting
- Clarifying wording without semantic impact

Rules:
- No decision log entry required
- Must not change test corpus outputs

---

### 2. Syntactic Extensions

Examples:
- New optional syntax sugar
- New section forms that do not alter meaning

Rules:
- Decision log entry REQUIRED
- Grammar updated
- Corpus MAY be extended
- Backward compatible

---

### 3. Semantic Changes

Examples:
- New validation rules
- Modified interpretation of existing rules
- Changed aggregation logic

Rules:
- Decision log entry REQUIRED
- New corpus cases REQUIRED
- Backward compatibility MUST be stated
- Version bump REQUIRED

---

### 4. Breaking Changes

Examples:
- Removal of a core concept
- Changed meaning of existing constructs
- Invalidation of previous VALID specs

Rules:
- Decision log entry REQUIRED
- Explicit deprecation period
- Major version bump REQUIRED

---

## Versioning Policy

DIL uses semantic versioning at the **spec level**:

- `vX` — Major semantic version
- `vX.Y` — Minor semantic extension
- `vX.Y.Z` — Editorial or tooling clarification

Validator versions are NOT authoritative; the spec version is.

---

## Backward Compatibility

Backward compatibility is defined **only** in terms of:

- Validator classification (valid / invalid / undecidable)
- Canonical JSON output

If either changes for an existing corpus file, compatibility is broken.

---

## Anti‑Drift Rules

The following are forbidden without an explicit semantic decision:

- Inferring missing capabilities
- Making previously undecidable cases valid by default
- Adding “helpful” defaults
- Allowing LLMs to complete specifications

---

## LLM Interaction Policy

LLMs:
- MAY assist in drafting proposals
- MAY generate alternative formulations

LLMs:
- MUST NOT approve changes
- MUST NOT be the sole author of semantic decisions

Human review is mandatory for all semantic changes.

---

## Authority Model

Until otherwise stated:

- Final semantic authority rests with the **DIL Core Maintainer(s)**
- Authority is exercised via the decision log

There is no voting mechanism at this stage.

---

## Forking Policy

Forks are allowed.

However:
- Forks MUST NOT claim DIL compatibility if they diverge semantically
- Semantic divergence requires a new name or version namespace

---

## Compliance Statement

Any project claiming DIL compatibility MUST:
- Respect this governance model
- Treat the decision log as authoritative
- Reject changes that bypass these rules

Failure to comply invalidates any claim of DIL conformance.

