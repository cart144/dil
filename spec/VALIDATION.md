# DIL — Validation Model

This document defines when a DIL specification is considered **valid**, **invalid**, or **undecidable**, and how validation results are reported.

Validation is normative: a DIL tool may extend diagnostics, but must not weaken these rules.

---

## 1. Validation Scope

Validation applies to a **DIL Specification** as a whole and to its constituent artifacts:

* system
* intents
* constraints
* capabilities
* decisions
* change conditions

Each validation explicitly declares its target and scope.

---

## 2. Validity States

A DIL specification MUST evaluate to exactly one of the following states:

* **VALID**
  All mandatory validations are satisfied and no hard constraints are violated.

* **INVALID**
  At least one hard constraint is violated or a mandatory validation is unsatisfied.

* **UNDECIDABLE**
  The specification cannot be fully evaluated due to missing information, missing evidence, or insufficient capability.

UNDECIDABLE is not a failure; it is an explicit informational outcome.

---

## 3. Mandatory Validations

The following validations are mandatory for any DIL specification.

### V-M1 — Intent Verifiability

Every declared intent MUST be associated with at least one validation.

Failure of V-M1 results in **INVALID**.

---

### V-M2 — Constraint Integrity

All referenced constraints MUST exist and MUST be evaluable.

If a constraint exists but cannot be evaluated, the result is **UNDECIDABLE**.
If a constraint is violated, the result is **INVALID**.

---

### V-M3 — Decision Traceability

Every decision MUST:

* reference at least one intent it supports
* reference zero or more constraints it respects

A decision referencing non-existent intents or constraints results in **INVALID**.

---

### V-M4 — Capability Coverage

All validations MUST be executable using the declared capabilities of the system.

If a validation requires an undeclared capability, the result is **UNDECIDABLE**.

---

### V-M5 — No Implementation Leakage

The specification MUST NOT prescribe:

* algorithms
* control flow
* procedural steps
* implementation-specific instructions

Any detected implementation leakage results in **INVALID**.

---

## 4. Validation Outcomes

Each validation produces a structured outcome with the following fields:

* **status**: SATISFIED | UNSATISFIED | UNKNOWN | INAPPLICABLE
* **target**: reference to the evaluated artifact
* **evidence** (optional)
* **notes** (optional, explanatory only)

Validation outcomes are data, not logs.

---

## 5. Structured Errors

When a specification is INVALID, one or more **Structured Errors** MUST be emitted.

A structured error MUST include:

* **code**: stable, machine-readable identifier
* **message**: minimal human-readable explanation
* **refs**: references to related intents, constraints, decisions, or validations

Errors MUST NOT include stack traces or runtime details.

---

## 6. Aggregation Rules

Validation aggregation follows these rules:

1. If any hard constraint is violated → INVALID
2. Else if any mandatory validation is UNSATISFIED → INVALID
3. Else if any mandatory validation is UNKNOWN due to missing information → UNDECIDABLE
4. Else → VALID

Aggregation is deterministic.

---

## 7. Revalidation on Change

Any change to:

* intents
* constraints
* decisions
* capabilities

MUST trigger full revalidation.

A change that alters validation outcomes MUST be accompanied by an explicit decision describing the change rationale.

---

## 8. Non-Goals

The validation model explicitly excludes:

* automatic remediation
* optimization strategies
* execution planning

If validation begins to imply how to fix a problem, it exceeds its mandate.
