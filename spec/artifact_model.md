# DIL — Artifact Model

This document defines the canonical model for DIL artifacts, including identifiers, scoping rules, and reference resolution.

The artifact model is normative. Any validator or tool that interprets artifacts differently is non-conformant.

---

## 1. Artifact Types

A DIL specification is composed of the following artifact types:

- system
- capability
- intent
- constraint
- decision
- validation
- change condition

Each artifact is **first-class**, addressable, and referenceable.

---

## 2. Identifiers (IDs)

### 2.1 ID Format

Every artifact MUST have a unique identifier within its artifact type.

Rules:
- IDs MUST be ASCII alphanumeric with optional underscores
- IDs MUST start with a letter
- IDs MUST be case-sensitive

Examples:
- `I1`, `I_PAYMENT_AUDIT`
- `C1`, `C_NO_IMPLEMENTATION`
- `D1`
- `V_M1`

---

### 2.2 ID Scope

IDs are scoped by artifact type.

Valid:
- `I1` (intent)
- `C1` (constraint)

Invalid:
- reusing `I1` for two intents
- referencing `I1` as a constraint

ID collisions across artifact types are allowed but discouraged.

---

## 3. Fully Qualified References

Artifacts MAY be referenced in fully qualified form:

- `intents.I1`
- `constraints.C1`
- `decisions.D1`
- `validations.V1`

Fully qualified references remove ambiguity and SHOULD be preferred in validators and reports.

---

## 4. Reference Resolution

### 4.1 Direct References

A direct reference resolves to exactly one artifact.

Rules:
- the referenced artifact MUST exist
- the artifact MUST be of the expected type

Failure to resolve a direct reference results in **INVALID**.

---

### 4.2 Wildcard References

Wildcard references allow selecting multiple artifacts.

Canonical wildcard forms:
- `intents.*`
- `constraints.*`
- `decisions.*`
- `validations.*`

Rules:
- wildcards resolve to zero or more artifacts
- empty resolution is allowed unless explicitly prohibited by validation

Wildcards MUST NOT cross artifact types.

---

### 4.3 Resolution Order

Resolution is deterministic and follows declaration order within the specification.

Ordering rules:
1. artifacts are resolved by type
2. within a type, resolution follows lexical declaration order

This ordering affects reporting only, not validity.

---

## 5. Reference Integrity

Reference integrity rules:

- references to non-existent artifacts → **INVALID**
- references to wrong artifact type → **INVALID**
- wildcard resolving to zero artifacts → valid unless prohibited

Reference integrity violations MUST emit structured errors.

---

## 6. Implicit vs Explicit Scope

There is no implicit scope in DIL.

Rules:
- all references are resolved within the current system
- cross-system references are forbidden

Any construct that relies on implicit scope is invalid.

---

## 7. Artifact Mutability

Artifacts are immutable within a single specification.

Changes are expressed only by:
- new specification versions, or
- explicit change conditions + decisions

Artifacts MUST NOT be mutated in-place.

---

## 8. Non-Goals

This artifact model explicitly excludes:
- inheritance
- polymorphism
- dynamic scoping

If a feature introduces dynamic resolution, it violates determinism and must be rejected.

