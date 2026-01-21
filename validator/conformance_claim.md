# DIL Core Validator — Conformance Claim

Validator: /var/lib/dil/validator
Spec support: DIL:spec v0
Conformance level: core

## Evidence
Golden outputs matched byte-for-byte:

- example_invalid.dil
  - expected: /var/lib/dil/expected_validation_report.json
  - result: match (diff empty)
  - exit code: 1 (invalid)

- example_undecidable.dil
  - expected: /var/lib/dil/expected_validation_report_undecidable.json
  - result: match (diff empty)
  - exit code: 2 (undecidable)

## Determinism
Canonical JSON emission follows CANONICAL_REPORT_SCHEMA.md ordering and key-sorting rules.
No timestamps or non-deterministic fields are emitted.