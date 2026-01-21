# DIL — Expected Validation Reports (Golden Outputs)

This document defines the expected validation outputs for the DIL test corpus.
These are normative test targets ("golden outputs") for any DIL validator.

Golden JSON files are located in `golden/`.

---

# INVALID Case: `example_invalid.dil`

> Input: `example_invalid.dil`
> Expected overall state: **INVALID**
> Golden output: `golden/expected_validation_report.json`

## Overall Result

- **spec**: `DIL:spec v0`
- **system**: `DIL.FailureSeed`
- **state**: `INVALID`

## Mandatory Validation Outcomes

### V-M1 — Intent Verifiability

- **id**: `V-M1`
- **status**: `UNSATISFIED`
- **targets**:
  - `intents.I1` (missing validation association)
  - `intents.I2` (missing validation association)
- **errors**:
  - {
      "code": "INTENT_NOT_VERIFIABLE",
      "message": "Intent lacks explicit validation; verifiability is required.",
      "refs": { "intent": "I1", "validation": "V-M1" }
    }
  - {
      "code": "INTENT_NOT_VERIFIABLE",
      "message": "Intent lacks explicit validation; verifiability is required.",
      "refs": { "intent": "I2", "validation": "V-M1" }
    }

### V-M2 — Constraint Integrity

- **id**: `V-M2`
- **status**: `SATISFIED`
- **notes**: "All declared constraints (C1, C2) exist and are syntactically evaluable."

> Note: Reference integrity for decisions is covered by V-M3.

### V-M3 — Decision Traceability

- **id**: `V-M3`
- **status**: `UNSATISFIED`
- **targets**:
  - `decisions.D1` (missing intent linkage)
  - `decisions.D2` (references non-existent artifacts)
- **errors**:
  - {
      "code": "UNTRACED_DECISION",
      "message": "Decision missing traceability links to intents/constraints.",
      "refs": { "constraint": "C2", "decision": "D1" }
    }
  - {
      "code": "BROKEN_REFERENCE",
      "message": "Decision references non-existent intent or constraint.",
      "refs": { "decision": "D2", "intent": "I_DO_NOT_EXIST", "constraint": "C_DO_NOT_EXIST" }
    }

### V-M4 — Capability Coverage

- **id**: `V-M4`
- **status**: `SATISFIED`
- **notes**: "Validations V1 and V5 are executable using declared capabilities (emit_structured_validation, emit_structured_errors)."

> Note: This checks coverage, not correctness.

### V-M5 — No Implementation Leakage

- **id**: `V-M5`
- **status**: `UNSATISFIED`
- **target**: `system`
- **evidence**:
  - "implementation_notes contains algorithmic and procedural directives (B-Tree, LRU, Big-O, scheduled job)."
- **errors**:
  - {
      "code": "IMPLEMENTATION_LEAK",
      "message": "Specification prescribes implementation; violates No Implementation.",
      "refs": { "constraint": "C1", "validation": "V-M5" }
    }

## Aggregation Proof

Aggregation follows `VALIDATION.md`:

1. Hard constraint violation detected via V-M5 → **INVALID**
2. Mandatory validations UNSATISFIED (V-M1, V-M3, V-M5) → **INVALID**

Therefore, overall state is **INVALID**.

---

# UNDECIDABLE Case: `example_undecidable.dil`

> Input: `example_undecidable.dil`
> Expected overall state: **UNDECIDABLE**
> Golden output: `golden/expected_validation_report_undecidable.json`

## Overall Result

- **spec**: `DIL:spec v0`
- **system**: `DIL.UndecidableSeed`
- **state**: `UNDECIDABLE`

## Mandatory Validation Outcomes

### V-M1 — Intent Verifiability

- **id**: `V-M1`
- **status**: `SATISFIED`
- **notes**: "Intent I1 is associated with validation V4."

### V-M2 — Constraint Integrity

- **id**: `V-M2`
- **status**: `SATISFIED`
- **notes**: "Constraint C1 exists and is evaluable."

### V-M3 — Decision Traceability

- **id**: `V-M3`
- **status**: `SATISFIED`
- **notes**: "Decision D1 supports I1 and respects C1."

### V-M4 — Capability Coverage

- **id**: `V-M4`
- **status**: `UNKNOWN`
- **reason**: "Validation V4 requires undeclared capability 'collect_external_evidence'."

### V-M5 — No Implementation Leakage

- **id**: `V-M5`
- **status**: `SATISFIED`

## Aggregation Proof

Aggregation follows `VALIDATION.md`:

1. No hard constraint violations detected
2. No mandatory validation UNSATISFIED
3. Mandatory validation UNKNOWN due to missing capability → **UNDECIDABLE**

Therefore, overall state is **UNDECIDABLE**.

---

# Determinism Requirements

A validator MUST:
- Emit the same overall state for the same input
- Emit stable error codes
- Preserve references to targets (intent/constraint/decision ids)
- Return UNDECIDABLE (not INVALID) when capabilities are missing
- Preserve the reason for missing capability
- Allow revalidation when capabilities change

Ordering of errors MAY vary, but the set MUST be identical.
