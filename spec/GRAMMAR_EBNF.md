# GRAMMAR_EBNF.md

Descriptive EBNF for DIL:spec v0 (Corpus-Derived)

---

## Scope

**In-scope:**
- Syntax structures observed in the `/var/lib/dil/example*.dil` corpus (9 files).
- Section and block organization.
- Field key names and value shapes as evidenced.

**Out-of-scope:**
- Lexer rules, tokenization, precedence.
- String escaping, Unicode handling.
- Predicate expression syntax (treated as opaque quoted strings).
- Semantic validation rules (see VALIDATION.md).

---

## Conventions

```
non_terminal   = definition ;
"literal"      = exact text
[ optional ]   = zero or one
{ repeating }  = zero or more
( grouping )   = grouping
|              = alternation
```

- **Whitespace:** Treated loosely; indentation is conventional but not enforced.
- **Comments:** Lines beginning with `#` (after optional whitespace) are comments.
- **Identifiers:** `[A-Za-z][A-Za-z0-9_]*` (letters, digits, underscores; starts with letter).

---

## EBNF

### Top-Level Structure

```ebnf
spec           = header , system_block ;

header         = "DIL:spec" , "v0" ;

system_block   = "system" , quoted_string , "{" , { section } , "}" ;
```

### Sections

```ebnf
section        = about_section
               | capabilities_section
               | intents_section
               | constraints_section
               | decisions_section
               | validations_section
               | change_section
               | implementation_notes_section ;

about_section  = "about" , "{" , { field_line } , "}" ;

capabilities_section = "capabilities" , "{" , { identifier } , "}" ;

intents_section = "intents" , "{" , { intent_block } , "}" ;

constraints_section = "constraints" , "{" , { constraint_block } , "}" ;

decisions_section = "decisions" , "{" , { decision_block } , "}" ;

validations_section = "validations" , "{" , { validation_block } , "}" ;

change_section = "change" , "{" , { condition_block } , "}" ;

implementation_notes_section = "implementation_notes" , "{" , { comment_line } , "}" ;
```

### Artifact Blocks

```ebnf
intent_block   = "intent" , identifier , quoted_string , "{" , { intent_field } , "}" ;

intent_field   = "statement" , ":" , quoted_string
               | "validations" , ":" , identifier_list ;

constraint_block = "constraint" , identifier , quoted_string , "{" , { constraint_field } , "}" ;

constraint_field = "rule" , ":" , quoted_string
                 | "severity" , ":" , severity_value ;

severity_value = "HARD" ;

decision_block = "decision" , identifier , quoted_string , "{" , { decision_field } , "}" ;

decision_field = "rationale" , ":" , quoted_string
               | "supports" , ":" , identifier_list
               | "respects" , ":" , identifier_list
               | "supersedes" , ":" , identifier_list ;

validation_block = "validate" , identifier , quoted_string , "{" , { validation_field } , "}" ;

validation_field = "target" , ":" , target_value
                 | "predicate" , ":" , quoted_string
                 | "requires_capability" , ":" , quoted_string
                 | "on_fail" , ":" , on_fail_block
                 | "on_unknown" , ":" , on_unknown_block ;

target_value   = identifier
               | identifier , "." , "*" ;

on_fail_block  = "error" , "{" , { error_field } , "}" ;

error_field    = "code" , ":" , quoted_string
               | "message" , ":" , quoted_string
               | "refs" , ":" , refs_block ;

refs_block     = "{" , { ref_field } , "}" ;

ref_field      = identifier , ":" , quoted_string ;

on_unknown_block = "{" , { on_unknown_field } , "}" ;

on_unknown_field = "status" , ":" , "UNKNOWN"
                 | "reason" , ":" , quoted_string ;

condition_block = "condition" , identifier , quoted_string , "{" , { condition_field } , "}" ;

condition_field = "statement" , ":" , quoted_string ;
```

### Primitives

```ebnf
field_line     = identifier , ":" , quoted_string ;

identifier_list = "[" , [ identifier , { "," , identifier } ] , "]" ;

identifier     = letter , { letter | digit | "_" } ;

quoted_string  = '"' , { char } , '"' ;

comment_line   = "#" , { any_char } ;
```

---

## Corpus Coverage Notes

| Construct | Corpus Files |
|-----------|--------------|
| `DIL:spec v0` header | all 9 files |
| `system "ID" { }` | all 9 files |
| `about { }` | all 9 files |
| `capabilities { }` | all 9 files |
| `intents { }` | all 9 files |
| `constraints { }` | all 9 files |
| `decisions { }` | example.dil, example_valid_strict.dil, example_invalid.dil, example_undecidable.dil, example_invalid_vm3_untraced.dil, example_invalid_vm5_leak.dil, example_undecidable_vm4_single.dil, example_undecidable_vm4_multi.dil (8 files) |
| `validations { }` | example.dil, example_valid_strict.dil, example_invalid.dil, example_undecidable.dil, example_invalid_vm3_untraced.dil, example_invalid_vm5_leak.dil, example_undecidable_vm4_single.dil, example_undecidable_vm4_multi.dil (8 files) |
| `change { }` | example.dil, example_valid_strict.dil, example_undecidable.dil (3 files) |
| `implementation_notes { }` | example_invalid.dil, example_invalid_vm5_leak.dil (2 files) |
| `intent ID "Title" { }` | all 9 files |
| `validations:` field in intent | example_valid_strict.dil, example_invalid_vm3_untraced.dil, example_invalid_vm5_leak.dil (3 files) |
| `constraint ID "Title" { }` | all 9 files |
| `severity: HARD` | all 9 files |
| `decision ID "Title" { }` | 8 files (not example_invalid_vm1_only.dil) |
| `supports: [...]` | 8 files |
| `respects: [...]` | 8 files |
| `supersedes: [...]` | 8 files |
| `validate ID "Title" { }` | 8 files (not example_invalid_vm1_only.dil) |
| `target: intents.*` | example.dil, example_valid_strict.dil, example_invalid.dil, example_undecidable.dil, example_invalid_vm3_untraced.dil, example_invalid_vm5_leak.dil (6 files) |
| `target: decisions.*` | example.dil, example_undecidable.dil, example_undecidable_vm4_single.dil, example_undecidable_vm4_multi.dil (4 files) |
| `target: system` | example.dil, example_valid_strict.dil, example_invalid.dil (3 files) |
| `requires_capability:` | example_undecidable.dil, example_undecidable_vm4_single.dil, example_undecidable_vm4_multi.dil (3 files) |
| `on_fail: error { }` | example.dil, example_valid_strict.dil, example_invalid.dil (3 files) |
| `refs: { }` | example.dil, example_valid_strict.dil, example_invalid.dil (3 files) |
| `on_unknown: { }` | example_undecidable.dil (1 file) |
| `condition ID "Title" { }` | example.dil, example_valid_strict.dil, example_undecidable.dil (3 files) |

---

## Non-goals / Not Specified

The following are intentionally **not specified** in this grammar:

1. **Predicate expression syntax** — Treated as opaque quoted strings. No grammar for comparison operators, boolean logic, or variable interpolation.

2. **String interpolation** — `${target.id}` patterns appear in corpus but syntax/escaping rules are unspecified.

3. **String escaping** — Backslash sequences, Unicode escapes, multiline strings not specified.

4. **Whitespace rules** — No precise indentation or newline requirements.

5. **Section ordering** — Corpus suggests conventional order but no strict rule evidenced.

6. **Severity values beyond HARD** — Only `HARD` observed; `SOFT` or other values unspecified.

7. **Additional field keys** — Only keys observed in corpus are included. Extensions would require corpus evidence.

8. **Nested block depth** — Only `on_fail: error { refs: { } }` (depth 2) observed; deeper nesting unspecified.

9. **List item types** — Lists contain identifiers only (not quoted strings) in all corpus evidence.

---

## Self-Check

- **No new features introduced** — All constructs derived from corpus files.
- **Derived from corpus only** — 9 files analyzed: example.dil, example_valid_strict.dil, example_invalid.dil, example_invalid_vm1_only.dil, example_invalid_vm3_untraced.dil, example_invalid_vm5_leak.dil, example_undecidable.dil, example_undecidable_vm4_single.dil, example_undecidable_vm4_multi.dil.
