# DIL Global Install & CLI Exposure Spec (curl | bash)

## Purpose

This document defines how **DIL is installed, exposed, and executed as a global system command**.

The goal is to ensure that:

- `dil` behaves like a first-class system tool (git, docker, node)
- the user can type `dil --help` immediately after install
- the CLI UX Contract is preserved regardless of environment
- the user never needs to know how DIL is implemented internally

This spec is **binding** for implementation.

---

## Design Principles

1. **Zero mental overhead**
   - One command to install
   - One command to run

2. **System-native behavior**
   - Global binary in PATH
   - Predictable exit codes
   - Standard `--help`, `--version`

3. **No runtime coupling**
   - The user does not care if DIL is Node, Bun, Go, or Rust
   - Internal runtime is an implementation detail

4. **Fail fast, fail loud**
   - Installer errors are explicit
   - No silent partial installs

---

## Target User Experience

### Install

```bash
curl -fsSL https://get.dil.dev | bash
```

### Verify

```bash
dil --version
dil --help
```

### Run

```bash
dil agent auth-demo.dil -- claude -p "..."
```

No additional steps. No environment variables required.

---

## Installation Flow (High Level)

1. Detect OS and architecture
2. Download correct DIL distribution
3. Install to a global location
4. Expose `dil` on PATH
5. Verify installation
6. Print success summary

If **any step fails**, installation aborts.

---

## Supported Platforms (v1)

- Linux (x86_64, arm64)
- macOS (Intel, Apple Silicon)

Windows is **explicitly out of scope** for v1.

---

## Install Locations

### Preferred (default)

```text
/usr/local/bin/dil
```

### Fallback (no sudo)

```text
$HOME/.local/bin/dil
```

Installer must:

- detect write permissions
- explain clearly where DIL was installed
- warn if PATH update is required

---

## Internal Execution Model

The `dil` command is a **thin launcher**.

It is responsible for:

- parsing CLI arguments
- printing help/version
- invoking the internal runtime

### Allowed internal models

Any of the following are acceptable:

- bundled Node.js binary + JS entrypoint
- Bun single-file executable
- compiled native binary

**The user must not be able to tell which one is used.**

---

## CLI Contract Enforcement

The global `dil` command **must fully respect**:

- Exit codes defined in the CLI UX Contract
- Output guarantees (no silent runs)
- Deterministic final states

The installer **must not** introduce wrappers that:

- swallow stdout/stderr
- alter exit codes
- change buffering behavior

---

## `dil --help` Requirements

`dil --help` must:

- work without any project present
- not require a `.dil` file
- print a concise, readable overview

Minimum required sections:

- Usage
- Core commands (`agent`, `verify`, `version`)
- Exit codes
- Link to documentation

---

## `dil --version` Requirements

Output format (strict):

```text
dil <version>
```

Optional (allowed):

```text
dil <version> (<platform>, <arch>)
```

No additional text.

---

## Upgrade Strategy

Re-running the install script:

```bash
curl -fsSL https://get.dil.dev | bash
```

Must:

- detect existing installation
- replace binary atomically
- preserve permissions
- not break running shells

---

## Uninstall Strategy (Optional v1)

If provided, uninstall must be explicit:

```bash
dil uninstall
```

Or manual:

```bash
rm /usr/local/bin/dil
```

No hidden files left behind.

---

## Security Considerations

Installer must:

- use HTTPS only
- verify checksums or signatures
- avoid `eval` or unsafe shell expansion

The script must be:

- readable
- auditable
- < 300 lines

---

## Non-Goals

This spec does **not** cover:

- package managers (apt, brew)
- Windows MSI installers
- auto-update daemons
- telemetry or analytics

---

## Success Criteria

The installation is considered successful if:

```bash
dil --help
dil agent --help
```

Both commands:

- execute instantly
- return exit code 0
- produce human-readable output

---

## Final Note

This installer is **part of the product UX**.

If installing DIL feels fragile, confusing, or magical — the implementation is wrong.

DIL must feel boring, solid, and inevitable.

