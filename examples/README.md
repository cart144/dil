# DIL Test Corpus

Canonical Test Corpus — DIL M3 Conformance

---

## VALID

VALID cases intentionally have no golden JSON. Conformance is asserted by:
- state == "valid"
- errors == []
- exit code == 0

| File | system_id | State | Exit | Golden |
|------|-----------|-------|------|--------|
| `example.dil` | `DIL.MinimalSeed` | valid | 0 | no golden |
| `example_valid_strict.dil` | `DIL.ValidStrict` | valid | 0 | no golden |

---

## INVALID

| File | system_id | State | Exit | Golden |
|------|-----------|-------|------|--------|
| `example_invalid.dil` | `DIL.FailureSeed` | invalid | 1 | `golden/expected_validation_report.json` |
| `example_invalid_vm1_only.dil` | `DIL.InvalidVM1Only` | invalid | 1 | `golden/expected_invalid_vm1_only.json` |
| `example_invalid_vm3_untraced.dil` | `DIL.InvalidVM3Untraced` | invalid | 1 | `golden/expected_invalid_vm3_untraced.json` |
| `example_invalid_vm5_leak.dil` | `DIL.InvalidVM5Leak` | invalid | 1 | `golden/expected_invalid_vm5_leak.json` |

---

## UNDECIDABLE

| File | system_id | State | Exit | Golden |
|------|-----------|-------|------|--------|
| `example_undecidable.dil` | `DIL.UndecidableSeed` | undecidable | 2 | `golden/expected_validation_report_undecidable.json` |
| `example_undecidable_vm4_single.dil` | `DIL.UndecidableVM4Single` | undecidable | 2 | `golden/expected_undecidable_vm4_single.json` |
| `example_undecidable_vm4_multi.dil` | `DIL.UndecidableVM4Multi` | undecidable | 2 | `golden/expected_undecidable_vm4_multi.json` |

---

## How to Verify

From the repository root:

```bash
cd validator
npm run build

# INVALID cases (byte-for-byte diff)
node dist/index.js ../examples/example_invalid.dil | diff ../examples/golden/expected_validation_report.json -
node dist/index.js ../examples/example_invalid_vm1_only.dil | diff ../examples/golden/expected_invalid_vm1_only.json -
node dist/index.js ../examples/example_invalid_vm3_untraced.dil | diff ../examples/golden/expected_invalid_vm3_untraced.json -
node dist/index.js ../examples/example_invalid_vm5_leak.dil | diff ../examples/golden/expected_invalid_vm5_leak.json -

# UNDECIDABLE cases (byte-for-byte diff)
node dist/index.js ../examples/example_undecidable.dil | diff ../examples/golden/expected_validation_report_undecidable.json -
node dist/index.js ../examples/example_undecidable_vm4_single.dil | diff ../examples/golden/expected_undecidable_vm4_single.json -
node dist/index.js ../examples/example_undecidable_vm4_multi.dil | diff ../examples/golden/expected_undecidable_vm4_multi.json -

# VALID cases (assert state=valid, errors=[])
node dist/index.js ../examples/example.dil | jq -e '.state == "valid" and .errors == []'
node dist/index.js ../examples/example_valid_strict.dil | jq -e '.state == "valid" and .errors == []'
```

All diff commands must produce no output. All jq commands must exit 0.

---

## Verification via DIL CLI

The CLI provides an alternative verification method with receipt generation.

```bash
# Using installed dil command
dil validate examples/example_invalid.dil --out /tmp/out.json
diff examples/golden/expected_validation_report.json /tmp/out.json

dil validate examples/example_undecidable.dil --out /tmp/out.json
diff examples/golden/expected_validation_report_undecidable.json /tmp/out.json

# VALID cases: assert exit code 0
dil validate examples/example_valid_strict.dil; [ $? -eq 0 ] && echo "PASS"
```

All diff commands must produce no output. VALID cases must exit with code 0.
