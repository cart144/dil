# DIL — Error Code Registry

This document defines the canonical registry of structured error codes for DIL.

Error codes are normative identifiers used by validators and tools. They enable deterministic testing, automation, and stable diagnostics.

---

## 1. Error Object Shape (Normative)

A structured error MUST include:
- **code**: stable, machine-readable identifier
- **message**: minimal human-readable explanation
- **refs**: object containing references to relevant artifacts and/or rules

A structured error MAY include:
- **evidence**: supporting snippets or references
- **notes**: optional, non-normative clarification

Errors MUST NOT include stack traces, runtime details, or implementation-specific data.

---

## 2. Code Format

Rules:
- codes MUST be uppercase with underscores
- codes MUST be stable across versions unless explicitly deprecated

Example: `UNSUPPORTED_SPEC_VERSION`

---

## 3. Canonical Error Codes

### 3.1 Parsing

#### PARSE_ERROR
Emitted when the input `.dil` specification cannot be parsed sufficiently to identify artifacts.

Refs SHOULD include:
- `location` (line/column or range if available)
- MAY include `hint`

A PARSE_ERROR MUST result in:
- `state: invalid`
- exit code `1`

### 3.2 Versioning

#### UNSUPPORTED_SPEC_VERSION
Emitted when the validator does not support the declared spec version.

Refs MUST include:
- `spec`
- `supported` (list)

---

### 3.3 Verifiability

#### INTENT_NOT_VERIFIABLE
Emitted when an intent lacks required validation association.

Refs MUST include:
- `intent`
- `validation` (typically `V-M1`)

---

### 3.4 Reference Integrity

#### BROKEN_REFERENCE
Emitted when a reference cannot be resolved.

Refs MUST include:
- `ref` (the unresolved reference)
- MAY include `expected_type`
- MAY include `owner` (artifact that contained the reference)

---

#### WRONG_REFERENCE_TYPE
Emitted when a reference resolves but is of the wrong artifact type.

Refs MUST include:
- `ref`
- `expected_type`
- `actual_type`

---

### 3.4 Traceability

#### UNTRACED_DECISION
Emitted when a decision lacks required linkage.

Refs MUST include:
- `decision`
- `constraint` (typically traceability rule/constraint id)

---

### 3.5 Constraint Violations

#### CONSTRAINT_VIOLATION
Emitted when a hard constraint is violated.

Refs MUST include:
- `constraint`
- MAY include `target`

Evidence SHOULD be included when available.

---

### 3.6 Validation Failures

#### VALIDATION_UNSATISFIED
Emitted when a mandatory validation predicate is unsatisfied.

Refs MUST include:
- `validation`
- MAY include `target`

---

#### VALIDATION_UNKNOWN
Emitted when a mandatory validation cannot be decided (UNKNOWN) due to missing information/capability/evidence.

Refs MUST include:
- `validation`
- `reason`
- MAY include `missing_capability`

---

### 3.7 No Implementation Leakage

#### IMPLEMENTATION_LEAK
Emitted when the specification prescribes implementation directives.

Refs MUST include:
- `constraint` (typically `C1` or canonical equivalent)
- `validation` (typically `V-M5`)

Evidence SHOULD include the offending excerpt or a stable pointer.

---

## 4. Deprecation of Error Codes

Error codes MAY be deprecated.

Rules:
- deprecation MUST be explicit
- deprecated codes MUST remain recognizable for at least one major version (vN → vN+1)
- validators SHOULD map deprecated codes to their replacement while preserving the original

---

## 5. Non-Goals

This registry excludes:
- vendor-specific diagnostics
- localized messages
- automatic remediation hints

Tools may add non-normative details, but MUST NOT change the meaning of canonical codes.

