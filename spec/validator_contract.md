# DIL — Reference Validator Contract (Core)

This contract defines the minimal, observable behavior of a **DIL Core Reference Validator**.

The validator is not a runtime. It does not plan or execute actions. It only:
- parses a DIL specification
- validates it according to DIL core rules
- emits a canonical validation report

---

## 1. Scope

This contract covers:
- supported spec versions
- inputs and outputs
- determinism requirements
- exit codes
- conformance expectations

It explicitly excludes:
- auto-remediation
- optimization
- execution planning
- UI/IDE integration

---

## 2. Supported Spec Versions

A Core Reference Validator MUST explicitly declare supported spec versions.

Minimum requirement for M2:
- supports `DIL:spec v0`

If an input declares an unsupported version, the validator MUST:
- emit a canonical report with `state: "invalid"`
- emit `UNSUPPORTED_SPEC_VERSION`
- exit with non-zero code

---

## 3. Input

### 3.1 Input Artifact

The validator consumes exactly one input file:
- extension: `.dil`
- encoding: UTF-8

### 3.2 Input Assumptions

The validator MUST NOT assume:
- network availability
- external evidence availability
- filesystem layout beyond the provided file path

---

## 4. Output

### 4.1 Canonical Report

The validator MUST emit a canonical JSON report conforming to:
- `CANONICAL_REPORT_SCHEMA.md`

The report MUST include:
- `spec_version`
- `system_id`
- `state`
- `outcomes`
- `errors`

### 4.2 Output Destination

The validator MUST support emitting the report to stdout.

Optionally, it MAY support writing to a file, but stdout support is mandatory.

---

## 5. Validation Rules (Core)

The validator MUST apply mandatory validations as defined in `VALIDATION.md`:

- V-M1 Intent Verifiability
- V-M2 Constraint Integrity
- V-M3 Decision Traceability
- V-M4 Capability Coverage
- V-M5 No Implementation Leakage

The validator MAY implement additional validations, but:
- MUST NOT alter core outcomes for the conformance corpus

---

## 6. Determinism

A Core Reference Validator MUST be deterministic.

Rules:
- same input file content MUST produce byte-identical canonical JSON output
- output MUST follow deterministic ordering rules
- output MUST NOT include timestamps or random identifiers

---

## 7. Exit Codes

Exit codes communicate only the overall validation state:

- `0` → VALID
- `1` → INVALID
- `2` → UNDECIDABLE

If the validator cannot parse the input at all, it MUST:
- emit a canonical report with `state: "invalid"`
- include `BROKEN_REFERENCE` or `VALIDATION_UNSATISFIED` only if meaningful
- otherwise emit a dedicated parse error code (recommended)

Recommended dedicated parse error code:
- `PARSE_ERROR`

If `PARSE_ERROR` is emitted, `state` MUST be `invalid` and exit code MUST be `1`.

---

## 8. Conformance Requirements

A validator claiming core conformance MUST:

1. Produce `state: "invalid"` for `example_invalid.dil` and match golden JSON:
   - `expected_validation_report.json`

2. Produce `state: "undecidable"` for `example_undecidable.dil` and match golden JSON:
   - `expected_validation_report_undecidable.json`

3. Produce `state: "valid"` for `example.dil` with:
   - `errors: []`

---

## 9. Non-Goals

The contract forbids:
- silently repairing input specifications
- inventing evidence
- probabilistic validation

If the validator cannot decide, it MUST say `undecidable`.

