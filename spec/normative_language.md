# DIL — Normative Language

This document defines the normative keywords used throughout the DIL specification.

Normative language establishes **what is required for conformance** versus what is optional or advisory. Any ambiguity here directly breaks verifiability and must be avoided.

---

## 1. Normative Keywords

The following keywords are normative and MUST be interpreted exactly as described in this document.

### MUST
Indicates an absolute requirement of the specification.

- A DIL specification or validator that violates a MUST requirement is **non-conformant**.
- MUST statements are enforceable via validation.

### MUST NOT
Indicates an absolute prohibition.

- Violating a MUST NOT requirement results in **INVALID**.

---

### SHOULD
Indicates a strong recommendation.

- There may exist valid reasons to ignore a SHOULD.
- Ignoring a SHOULD MUST NOT, by itself, cause INVALID.
- Ignoring a SHOULD MAY require justification in decision trace.

### SHOULD NOT
Indicates a strong discouragement.

- Violating a SHOULD NOT does not invalidate a specification.
- It may trigger warnings or advisory notes.

---

### MAY
Indicates an optional feature or behavior.

- Absence of a MAY feature MUST NOT affect validity.

---

## 2. Enforcement Rules

- Only MUST and MUST NOT statements define **hard validation rules**.
- SHOULD / SHOULD NOT define **quality expectations**, not correctness.
- MAY defines **extension points**, not requirements.

Validators MUST distinguish between:
- errors (from MUST / MUST NOT)
- warnings or notes (from SHOULD / SHOULD NOT)

---

## 3. Use of Normative Keywords

Rules:
- Normative keywords MUST be written in uppercase.
- Normative keywords MUST NOT be used casually or rhetorically.
- Every MUST or MUST NOT MUST be objectively testable.

If a rule cannot be validated deterministically, it MUST NOT be expressed as MUST.

---

## 4. Normativity Scope

Normative keywords apply to:
- DIL specifications
- DIL validators
- DIL conformance claims

Normative keywords do NOT apply to:
- implementation details
- performance characteristics
- tooling UX

---

## 5. Violations and Reporting

When a MUST or MUST NOT is violated, a validator:
- MUST emit a structured error
- MUST reference the violated rule
- MUST NOT attempt automatic correction

Violations of SHOULD / SHOULD NOT MAY be reported as advisory notes.

---

## 6. Non-Goals

This document explicitly excludes:
- natural-language interpretation
- probabilistic compliance
- heuristic validation

If compliance depends on interpretation or likelihood, the rule is invalid.

