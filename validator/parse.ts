/* Tolerant, non-inventive parser for DIL specs (M2 corpus-focused) */

export type ParseIssue = {
    code: "PARSE_ERROR";
    message: string;
    location?: { line: number; column?: number };
    fatal?: boolean;
};

export type ParsedIntent = { id: string };
export type ParsedConstraint = { id: string; severity?: "HARD" | "SOFT" | string };
export type ParsedDecision = {
    id: string;
    supports: string[];
    respects: string[];
};
export type ParsedValidation = {
    id: string;
    requires_capability?: string;
};

export type ParsedSpec = {
    spec_version: string; // e.g. "DIL:spec v0" or "unknown"
    system_id: string; // e.g. "DIL.FailureSeed" or "unknown"
    raw_text: string;
    sections_raw: Record<string, string>; // raw text per top-level section
    capabilities: Set<string>;
    intents: Map<string, ParsedIntent>;
    constraints: Map<string, ParsedConstraint>;
    decisions: Map<string, ParsedDecision>;
    validations: Map<string, ParsedValidation>;
    issues: ParseIssue[];
};

function stripComments(line: string): string {
    // DIL examples use '#' for comments
    const idx = line.indexOf("#");
    return idx >= 0 ? line.slice(0, idx) : line;
}

function parseBracketList(value: string): string[] {
    // supports: [I1, I2]  OR  supports: ["I1", "I2"]
    const m = value.match(/\[(.*)\]/);
    if (!m) return [];
    const inner = m[1].trim();
    if (!inner) return [];
    return inner
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.replace(/^"(.+)"$/, "$1").replace(/^'(.+)'$/, "$1"));
}

function parseQuotedOrBare(value: string): string | undefined {
    // requires_capability: "collect_external_evidence"
    // requires_capability: collect_external_evidence
    const v = value.trim();
    if (!v) return undefined;
    const qm = v.match(/^"([^"]+)"$/) || v.match(/^'([^']+)'$/);
    return (qm ? qm[1] : v).trim() || undefined;
}

function countChar(haystack: string, ch: string): number {
    let c = 0;
    for (let i = 0; i < haystack.length; i++) if (haystack[i] === ch) c++;
    return c;
}

export function parseDil(raw: string): ParsedSpec {
    const issues: ParseIssue[] = [];
    const spec: ParsedSpec = {
        spec_version: "unknown",
        system_id: "unknown",
        raw_text: raw,
        sections_raw: {},
        capabilities: new Set<string>(),
        intents: new Map(),
        constraints: new Map(),
        decisions: new Map(),
        validations: new Map(),
        issues,
    };

    const lines = raw.split(/\r?\n/);

    // 1) Header: first non-empty non-comment line should be "DIL:spec vX"
    for (let i = 0; i < lines.length; i++) {
        const l0 = stripComments(lines[i]).trim();
        if (!l0) continue;
        if (l0.startsWith("DIL:spec")) {
            spec.spec_version = l0;
        } else {
            issues.push({
                code: "PARSE_ERROR",
                message: `Missing or invalid spec header. Expected 'DIL:spec v<MAJOR>' but got '${l0}'.`,
                location: { line: i + 1, column: 1 },
                fatal: false, // keep going; validator can still report UNSUPPORTED_SPEC_VERSION later
            });
        }
        break;
    }

    // 2) system id: find `system "X"` (tolerant)
    for (let i = 0; i < lines.length; i++) {
        const l = stripComments(lines[i]);
        const m = l.match(/\bsystem\s+"([^"]+)"\s*\{/);
        if (m) {
            spec.system_id = m[1].trim() || "unknown";
            break;
        }
    }
    if (spec.system_id === "unknown") {
        issues.push({
            code: "PARSE_ERROR",
            message: `Missing system declaration. Expected: system "ID" { ... }`,
            location: { line: 1 },
            fatal: false,
        });
    }

    // 3) Top-level section scanning (brace-aware, but intentionally simple)
    // We track only first-level blocks inside system { ... }.
    let inSystem = false;
    let braceDepth = 0;

    type SectionName =
        | "capabilities"
        | "intents"
        | "constraints"
        | "decisions"
        | "validations"
        | "change"
        | "implementation_notes"
        | "about"
        | "unknown";

    let currentSection: SectionName = "unknown";
    let sectionDepth = -1;
    let sectionStartLine = -1;

    // For parsing decisions/validations, we track which artifact we are currently inside.
    let currentDecisionId: string | null = null;
    let currentValidationId: string | null = null;

    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const line = stripComments(rawLine);

        // Detect entering system block (first occurrence)
        if (!inSystem) {
            const mSys = line.match(/\bsystem\s+"([^"]+)"\s*\{/);
            if (mSys) {
                inSystem = true;
                // update depth based on this line
                braceDepth += countChar(line, "{") - countChar(line, "}");
            }
            continue;
        }

        // Update brace depth AFTER potential section detection based on previous depth,
        // but we need current braceDepth to detect top-level sections.
        // So we do section detection first using current braceDepth.

        const trimmed = line.trim();

        // Enter top-level section when we're inside system and at depth 1 (system body)
        // and line looks like: <section_name> {
        if (braceDepth === 1) {
            const secMatch = trimmed.match(
                /^(about|capabilities|intents|constraints|decisions|validations|change|implementation_notes)\s*\{\s*$/
            );
            if (secMatch) {
                currentSection = secMatch[1] as SectionName;
                sectionDepth = braceDepth + 1;
                sectionStartLine = i;
                spec.sections_raw[currentSection] = "";
                currentDecisionId = null;
                currentValidationId = null;
            }
        }

        // If in a known section, accumulate raw text
        if (currentSection !== "unknown") {
            spec.sections_raw[currentSection] += rawLine + "\n";

            // Parse inside capabilities: each non-empty word line is a capability id
            if (currentSection === "capabilities") {
                const capMatch = trimmed.match(/^([A-Za-z][A-Za-z0-9_]*)\s*$/);
                if (capMatch) spec.capabilities.add(capMatch[1]);
            }

            // Parse intents
            if (currentSection === "intents") {
                const mIntent = trimmed.match(/^intent\s+([A-Za-z][A-Za-z0-9_]*)\b/);
                if (mIntent) {
                    const id = mIntent[1];
                    if (!spec.intents.has(id)) spec.intents.set(id, { id });
                }
            }

            // Parse constraints
            if (currentSection === "constraints") {
                const mCon = trimmed.match(/^constraint\s+([A-Za-z][A-Za-z0-9_]*)\b/);
                if (mCon) {
                    const id = mCon[1];
                    if (!spec.constraints.has(id)) spec.constraints.set(id, { id });
                }
                const mSev = trimmed.match(/^severity\s*:\s*([A-Za-z][A-Za-z0-9_]*)\s*$/);
                if (mSev) {
                    // attach to the most recently declared constraint (tolerant)
                    const last = Array.from(spec.constraints.values()).at(-1);
                    if (last) last.severity = mSev[1];
                }
            }

            // Parse decisions (supports/respects)
            if (currentSection === "decisions") {
                const mDec = trimmed.match(/^decision\s+([A-Za-z][A-Za-z0-9_]*)\b/);
                if (mDec) {
                    currentDecisionId = mDec[1];
                    if (!spec.decisions.has(currentDecisionId)) {
                        spec.decisions.set(currentDecisionId, {
                            id: currentDecisionId,
                            supports: [],
                            respects: [],
                        });
                    }
                }

                const d = currentDecisionId ? spec.decisions.get(currentDecisionId) : undefined;
                if (d) {
                    const mSupports = trimmed.match(/^supports\s*:\s*(.+)\s*$/);
                    if (mSupports) d.supports = parseBracketList(mSupports[1]);

                    const mRespects = trimmed.match(/^respects\s*:\s*(.+)\s*$/);
                    if (mRespects) d.respects = parseBracketList(mRespects[1]);
                }
            }

            // Parse validations (requires_capability)
            if (currentSection === "validations") {
                const mVal = trimmed.match(/^validate\s+([A-Za-z][A-Za-z0-9_\-]*)\b/);
                if (mVal) {
                    currentValidationId = mVal[1];
                    if (!spec.validations.has(currentValidationId)) {
                        spec.validations.set(currentValidationId, { id: currentValidationId });
                    }
                }

                const v = currentValidationId ? spec.validations.get(currentValidationId) : undefined;
                if (v) {
                    const mReq = trimmed.match(/^requires_capability\s*:\s*(.+)\s*$/);
                    if (mReq) v.requires_capability = parseQuotedOrBare(mReq[1]);
                }
            }
        }

        // Now update brace depth for this line
        braceDepth += countChar(line, "{") - countChar(line, "}");

        // Exit section when brace depth drops below its entry depth
        if (currentSection !== "unknown" && sectionDepth !== -1 && braceDepth < sectionDepth) {
            currentSection = "unknown";
            sectionDepth = -1;
            sectionStartLine = -1;
            currentDecisionId = null;
            currentValidationId = null;
        }

        // Exit system when braceDepth returns to 0
        if (inSystem && braceDepth <= 0) break;
    }

    // Basic sanity: if no system braces were ever closed properly, mark non-fatal parse issue.
    if (!inSystem) {
        issues.push({
            code: "PARSE_ERROR",
            message: "System block was not detected; validation may be unreliable.",
            location: { line: 1 },
            fatal: false,
        });
    }

    return spec;
}