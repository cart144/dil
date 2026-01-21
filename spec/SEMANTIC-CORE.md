# DIL — Decision & Intent Language

This document defines the minimal semantic primitives of DIL. These primitives are normative: any DIL runtime, validator, or tooling must preserve their meaning.

## 1. Entities

### 1.1 System
A **System** is the bounded subject described by DIL. A system is defined by:
- its declared capabilities
- its declared intents
- its constraints
- its decisions
- its validation outcomes

A system is not an implementation; it is a semantic boundary.

### 1.2 Actor
An **Actor** is any entity that can propose, accept, reject, or execute decisions.
Actors may be human or AI.

## 2. Primitives

### 2.1 Intent
An **Intent** is a declarative statement of a desired state.

Normative properties:
- **Verifiable**: an intent must be evaluable as satisfied or unsatisfied.
- **Outcome-oriented**: it expresses *what must hold*, not *how to make it hold*.
- **Contextual**: it may reference scope, environment, or time.

An intent may have one or more validations.

### 2.2 Constraint
A **Constraint** is a declarative rule that limits acceptable solutions.

Normative properties:
- **Hard** by default: violating a constraint makes a solution invalid.
- **Explicit**: constraints must be stated; implicit constraints do not exist.
- **Testable**: a constraint must be evaluable.

Constraints may include:
- invariants (must always hold)
- prohibitions (must never occur)
- requirements (must occur)

### 2.3 Capability
A **Capability** is a declared ability of the system to perform a category of action or to interact with a category of resources.

Normative properties:
- capabilities are **declared before** actions are considered
- capability statements are **not** actions
- capabilities may be conditioned (e.g., availability, permissions)

Capabilities constrain what can be proposed; they do not prescribe what will happen.

### 2.4 Decision
A **Decision** is an explicit, reviewable selection among alternatives.

Normative properties:
- **Traceable**: a decision must include rationale and links to the intents/constraints it serves.
- **Comparable**: decisions must be distinguishable and reviewable over time.
- **Reversible by change**: decisions may be superseded, but supersession is itself a decision.

Decisions exist to prevent invisible reasoning.

### 2.5 Evidence
**Evidence** is any artifact that supports a validation outcome.

Normative properties:
- evidence must be referenceable (by id, URI, hash, or embedded excerpt)
- evidence must be attributable to an actor or source

Evidence is not required for every validation, but it is required when explainability demands it.

## 3. Validation

### 3.1 Validation Statement
A **Validation** is a declarative predicate evaluated against a system.

Normative properties:
- returns a **structured result** (not a boolean only)
- has a **scope** (what it evaluates)
- can include **evidence**

### 3.2 Validation Outcome
A validation outcome must be one of:
- **SATISFIED**
- **UNSATISFIED**
- **UNKNOWN** (insufficient information to decide)
- **INAPPLICABLE** (predicate does not apply in current scope)

UNKNOWN is not failure; it is missing information.

## 4. Errors (Structured)

An **Error** is a structured report produced when:
- a constraint is violated
- validation cannot be performed due to missing capability or missing evidence
- the specification is internally inconsistent

Normative properties:
- errors must be machine-readable
- errors must reference the violated constraint(s) or failed validation(s)
- errors must include a minimal explanation

## 5. Change

### 5.1 Change Condition
A **Change Condition** is any declared expectation that:
- environment, requirements, or assumptions may change
- the system must remain valid under revision

Normative properties:
- change is modeled explicitly (not implied)
- revisions produce a new decision trace

## 6. Priority (Optional, Non-Core)

Priority is intentionally non-core. If introduced, it must:
- never override hard constraints
- be explicit and reviewable
- be used only for selecting among multiple valid solutions

## 7. Non-Goals (Semantic)

The semantic core of DIL excludes:
- procedural execution
- control flow
- general computation
- Turing completeness

If an addition pushes DIL toward a general-purpose language, it must be rejected.

