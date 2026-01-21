# DIL — Conformance Suite

This document defines what it means to be conformant with DIL and how conformance is assessed.

Conformance is defined in terms of **observable artifacts** and **canonical validation output**, not implementation choices.

---

## 1. Conformance Targets

Conformance may be claimed by:

- a **DIL Validator** (primary target)
- a **DIL Tool** that produces or transforms DIL specifications

This document focuses on validator conformance.

---

## 2. Conformant Validator Definition

A validator is conformant if it:

1. **Parses** DIL specifications sufficiently to identify artifacts and references
2. **Applies** all mandatory validations defined in `VALIDATION.md`
3. **Respects** semantics defined in:
   - `FOUNDATION.md`
   - `SEMANTIC_CORE.md`
   - `ARTIFACT_MODEL.md`
   - `NORMATIVE_LANGUAGE.md`
   - `ERROR_CODES.md`
4. **Emits** canonical reports as defined in `CANONICAL_REPORT_SCHEMA.md`
5. **Produces deterministic output** for the same input

A validator MAY support additional validations and diagnostics, but MUST NOT change canonical outcomes.

---

## 3. Conformance Inputs (Test Corpus)

The minimum conformance corpus includes:

- `example.dil` (expected overall: VALID)
- `example_invalid.dil` (expected overall: INVALID)
- `example_undecidable.dil` (expected overall: UNDECIDABLE)

Additional corpora MAY be added over time.

---

## 4. Conformance Oracles (Golden Outputs)

Golden outputs define expected canonical reports.

Minimum required golden outputs:
- `expected_validation_report.json` for `example_invalid.dil`
- `expected_validation_report_undecidable.json` for `example_undecidable.dil`

Notes:
- golden outputs MUST use the canonical JSON schema
- ordering rules MUST be respected

During v0, golden outputs may be maintained alongside `.md` explainers.

---

## 5. Pass/Fail Rules

A validator passes conformance if:

- it emits `state` that matches expected state for each corpus input
- for inputs with golden outputs, emitted JSON matches golden JSON exactly (byte-for-byte) after canonical serialization

Canonical serialization means:
- keys sorted lexicographically
- no non-deterministic fields (timestamps, random ids)

---

## 6. Allowed Variations

A validator MAY vary in:
- internal architecture
- performance
- additional non-normative fields under `extensions`

A validator MUST NOT vary in:
- canonical fields
- canonical ordering
- canonical error codes for canonical violations

---

## 7. Conformance Claims

A tool claiming conformance MUST declare:

- supported spec versions (e.g., `DIL:spec v0`)
- conformance level: `core` (mandatory validations only) or `extended`

Conformance levels:

### core
Implements mandatory validations only.

### extended
Implements mandatory validations plus additional checks.

Extended validators MUST still match core canonical outcomes for the corpus.

---

## 8. Version Evolution

When spec version changes occur:
- the corpus MAY expand
- golden outputs MAY change only when mandated by `SPEC_VERSIONING.md`
- any change to golden outputs MUST be justified as a spec decision

---

## 9. Non-Goals

This suite excludes:
- fuzzing requirements
- security certification
- performance benchmarks
n
Conformance is correctness-by-spec, not quality-by-implementation.

