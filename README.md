# DIL (Decision & Intent Language)

An intent-oriented, AI-native formal language for declaring verifiable intents that govern system behavior.

This repository contains:
- **DIL Specification** (`/spec`) — normative language definition
- **Reference Validator** (`/validator`) — implements DIL:spec v0 with mandatory validations V-M1 through V-M5
- **CLI** (`/cli`) — orchestrates validation, verification, and agent execution
- **Examples** (`/examples`) — canonical test corpus and golden outputs

---

## Installation

```bash
curl -fsSL https://raw.githubusercontent.com/cart144/dil/main/install.sh | bash
```

Requirements: Node.js 18+

After installation:
```bash
dil --version
dil --help
```

---

## What DIL Is (and Is Not)

**DIL is:**

- A semantic control surface
- A language for declaring intent, constraints, and decisions
- A guardrail against hallucination and silent inference
- Validator-driven and corpus-verified

**DIL is not:**

- A programming language
- A workflow engine
- A policy DSL
- Turing-complete
- Self-executing

DIL does **not** execute, optimize, or prescribe implementations. It constrains decisions through verifiable intent, explicit constraints, and traceable outcomes.

---

## Repository Structure

```
/
├── README.md
├── LICENSE
├── install.sh
├── spec/                           # Normative specifications
│   ├── FOUNDATION.md
│   ├── SEMANTIC-CORE.md
│   ├── VALIDATION.md
│   ├── GRAMMAR_EBNF.md
│   ├── artifact_model.md
│   ├── canonical_report_schema.md
│   ├── error_codes.md
│   ├── conformance.md
│   ├── llm_contract.md
│   ├── governance.md
│   └── ...
├── examples/                       # Test corpus
│   ├── README.md                   # Corpus documentation
│   ├── example*.dil                # Canonical test cases
│   └── golden/                     # Expected outputs
│       └── expected_*.json
├── demos/                          # Demo applications
│   ├── auth-demo/
│   └── webapp-demo/
├── cli/                            # CLI implementation
│   ├── src/
│   └── dist/
├── validator/                      # Reference validator
│   ├── *.ts
│   └── dist/
├── scripts/                        # Build/release tooling
│   └── release/
└── .github/                        # CI/CD workflows
    └── workflows/
```

---

## Quickstart

### Using the CLI

```bash
# Validate a spec
dil validate examples/example_valid_strict.dil

# Verify checks against real system state
dil verify examples/example_verify_demo.dil

# Run agent-orchestrated execution
dil agent examples/example_agent_auth_demo.dil -- claude -p "..."
```

### Development Mode

```bash
# Build from source
cd cli && npm install && npm run build
cd ../validator && npm install && npm run build

# Run validator directly
node validator/dist/index.js examples/example_invalid.dil

# Run CLI directly
node cli/dist/index.js validate examples/example_valid_strict.dil
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | VALID / COMPLETED |
| `1` | INVALID / FAILED |
| `2` | UNDECIDABLE / UNKNOWN |

---

## Conformance Testing

DIL conformance is verified by **byte-for-byte comparison** against the canonical corpus.

```bash
node validator/dist/index.js examples/example_invalid.dil > output.json
diff examples/golden/expected_validation_report.json output.json
```

No output means conformance.

See: `examples/README.md`

---

## Using DIL with LLMs

LLMs may:
- Read DIL
- Explain DIL
- Reason *about* DIL

LLMs must not:
- Modify DIL
- Infer missing information
- Replace validation logic

See: `spec/llm_contract.md`

---

## Documentation

### Core Specification
- `spec/FOUNDATION.md` — Foundational axioms
- `spec/SEMANTIC-CORE.md` — Semantic primitives
- `spec/VALIDATION.md` — Validation rules and aggregation
- `spec/GRAMMAR_EBNF.md` — Syntax grammar

### Tooling Specification
- `spec/validator_contract.md` — Validator behavior
- `spec/VERIFICATION_EXTENSION.md` — Verification capabilities
- `spec/dil_cli_ux_contract_v_1.md` — CLI UX contract
- `spec/dil_global_install_cli_exposure_spec.md` — Installation behavior

### Reference
- `spec/artifact_model.md` — Artifact types and IDs
- `spec/canonical_report_schema.md` — Output JSON schema
- `spec/error_codes.md` — Error code registry
- `spec/conformance.md` — Conformance requirements

---

## Governance

DIL evolution is controlled. All semantic changes require corpus updates and are governed by `spec/governance.md`.

---

## License

Apache-2.0. See `LICENSE`.

---

## Status

- DIL:spec v0
- Core validator: conformant
- Corpus: stable

DIL is intentionally minimal. Its power comes from what it forbids.
