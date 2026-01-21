# Contributing to DIL

DIL is open to contributions. This document explains how to participate.

---

## Ground Rules

1. **No hand-waving** — proposals must be specific and testable
2. **Corpus-driven** — language changes require test case updates
3. **Determinism first** — if it can't be verified, it doesn't belong in DIL

---

## How to Contribute

### Reporting Issues

Open an issue for:
- Bugs in the validator or CLI
- Inconsistencies in the specification
- Missing documentation

Include:
- Steps to reproduce
- Expected vs actual behavior
- DIL version (`dil --version`)

### Proposing Changes

1. **Open an issue first** — describe the problem and proposed solution
2. **Wait for discussion** — changes to DIL semantics require consensus
3. **Fork and branch** — create a feature branch from `main`
4. **Submit a PR** — reference the issue number

---

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/dil.git
cd dil

# Install dependencies
cd validator && npm install && cd ..
cd cli && npm install && cd ..

# Build
cd validator && npm run build && cd ..
cd cli && npm run build && cd ..

# Verify
node cli/dist/index.js --version
```

---

## Running Tests

DIL uses byte-for-byte conformance testing against golden files.

```bash
# Run all conformance tests
node validator/dist/index.js examples/example_invalid.dil | diff examples/golden/expected_validation_report.json -
node validator/dist/index.js examples/example_valid_strict.dil | jq -e '.state == "valid" and .errors == []'
```

All tests must pass before submitting a PR.

---

## Pull Request Process

1. **Branch from `main`**
2. **Make your changes**
3. **Run conformance tests locally**
4. **Push and open PR**
5. **Wait for CI** — PR must pass "Build & Test"
6. **Address review feedback**
7. **Squash and merge** (maintainer)

### PR Requirements

- [ ] Conformance tests pass
- [ ] New features include test cases
- [ ] Documentation updated if needed
- [ ] Commit messages are clear and descriptive

---

## Code Style

- TypeScript for validator and CLI
- No external runtime dependencies (dev dependencies OK)
- Explicit over clever
- No `any` types without justification

---

## Specification Changes

Changes to DIL semantics (new keywords, validation rules, etc.) require:

1. Issue with rationale
2. Updated EBNF grammar (`spec/GRAMMAR_EBNF.md`)
3. New corpus test cases (`examples/`)
4. Golden output files (`examples/golden/`)
5. Validator implementation
6. Documentation updates

Small changes are not small if they affect semantics.

---

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
