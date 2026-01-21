# DIL — Canonical Validation Report Schema

This document defines the canonical, machine-readable output format for DIL validation.

The goal is deterministic validation output suitable for:
- golden tests
- automation
- diffing across versions

The schema is normative. A conformant validator MUST be able to emit reports in this canonical form.

---

## 1. Report Format

The canonical report format is JSON.

Rules:
- keys MUST be lowercase_snake_case
- arrays MUST be used for repeated elements
- timestamps MUST NOT be required (they break determinism)

A validator MAY emit additional non-normative metadata, but it MUST NOT alter canonical fields.

---

## 2. Top-Level Object

A canonical report MUST include:

- `spec_version` : string (e.g., `"DIL:spec v0"`)
- `system_id` : string (e.g., `"DIL.FailureSeed"`)
- `state` : `"valid" | "invalid" | "undecidable"`
- `outcomes` : array of validation outcomes
- `errors` : array of structured errors

Optional:
- `notes` : array of strings (non-normative)

---

## 3. Validation Outcome Object

Each element of `outcomes` MUST have:

- `validation_id` : string (e.g., `"V-M1"`)
- `status` : `"satisfied" | "unsatisfied" | "unknown" | "inapplicable"`
- `targets` : array of target references (may be empty)

Optional:
- `reason` : string (required when status is `unknown`)
- `evidence` : array of evidence items
- `notes` : array of strings (non-normative)

---

## 4. Target Reference

A target reference MUST be a string.

Recommended form:
- fully qualified reference (e.g., `"intents.I1"`, `"decisions.D2"`)

If a target is not addressable, the validator MUST still emit a stable surrogate reference.

---

## 5. Evidence Item

An evidence item MAY be either:

### 5.1 External reference
- `{ "kind": "ref", "value": "<uri|hash|id>" }`

### 5.2 Embedded excerpt
- `{ "kind": "excerpt", "value": "<short excerpt>" }`

Rules:
- excerpts SHOULD be short and stable
- evidence MUST NOT exceed what is necessary for explainability

---

## 6. Structured Error Object

Each element of `errors` MUST have:

- `code` : string (from `ERROR_CODES.md`)
- `message` : string
- `refs` : object

Optional:
- `evidence` : array of evidence items
- `notes` : array of strings (non-normative)

---

## 7. Deterministic Ordering Rules

To support diffing and golden tests, a validator MUST order output deterministically.

### 7.1 Ordering of `outcomes`
Outcomes MUST be ordered by:
1. `validation_id` (lexicographic ascending)
2. within same validation, `targets` lexicographic ascending

### 7.2 Ordering of `errors`
Errors MUST be ordered by:
1. `code` (lexicographic ascending)
2. then by stable stringification of `refs` (keys sorted)

### 7.3 Ordering of Object Keys
When serializing JSON:
- object keys MUST be sorted lexicographically

---

## 8. Aggregation Consistency

The `state` field MUST be consistent with `VALIDATION.md` aggregation rules.

If `state` is `invalid`, `errors` MUST be non-empty.
If `state` is `valid`, `errors` MUST be empty.
If `state` is `undecidable`, `errors` MAY be empty or include `VALIDATION_UNKNOWN`.

---

## 9. Extensibility

Validators MAY add an additional top-level field:
- `extensions` : object

Rules:
- extensions MUST NOT affect validity
- extensions MUST be ignorable without loss of canonical meaning

---

## 10. Non-Goals

This schema excludes:
- streaming output
- partial validation output
- remediation plans

If output begins to prescribe fixes, it exceeds its mandate.

