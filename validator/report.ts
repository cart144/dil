/* Canonical JSON report emitter for DIL */

type ReportState = "valid" | "invalid" | "undecidable";
type OutcomeStatus = "satisfied" | "unsatisfied" | "unknown" | "inapplicable";

export type EvidenceItem =
    | { kind: "ref"; value: string }
    | { kind: "excerpt"; value: string };

export type ValidationOutcome = {
    validation_id: string;
    status: OutcomeStatus;
    targets: string[];
    reason?: string; // required when status === "unknown"
    evidence?: EvidenceItem[];
    notes?: string[];
};

export type StructuredError = {
    code: string;
    message: string;
    refs: Record<string, unknown>;
    evidence?: EvidenceItem[];
    notes?: string[];
};

export type CanonicalReport = {
    spec_version: string;
    system_id: string;
    state: ReportState;
    outcomes: ValidationOutcome[];
    errors: StructuredError[];
    notes?: string[];
    extensions?: Record<string, unknown>;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Deep-sort object keys lexicographically.
 * Arrays are preserved in their current order (we sort specific arrays explicitly elsewhere).
 */
function deepSortKeys(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(deepSortKeys);
    }
    if (isPlainObject(value)) {
        const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
        const out: Record<string, unknown> = {};
        for (const k of keys) out[k] = deepSortKeys(value[k]);
        return out;
    }
    return value;
}

/**
 * Stable stringify for ordering comparisons (keys sorted).
 * No whitespace to maximize stability.
 */
function stableStringify(value: unknown): string {
    const sorted = deepSortKeys(value);
    return JSON.stringify(sorted);
}

function normalizeOutcome(o: ValidationOutcome): ValidationOutcome {
    const targets = [...(o.targets ?? [])].sort((a, b) => a.localeCompare(b));
    const evidence = o.evidence ? o.evidence.map((e) => ({ ...e })) : undefined;
    const notes = o.notes ? [...o.notes] : undefined;

    // Keep fields as-is; deepSortKeys later will sort object keys.
    return {
        validation_id: o.validation_id,
        status: o.status,
        targets,
        ...(o.reason ? { reason: o.reason } : {}),
        ...(evidence ? { evidence } : {}),
        ...(notes ? { notes } : {}),
    };
}

function normalizeError(e: StructuredError): StructuredError {
    const evidence = e.evidence ? e.evidence.map((x) => ({ ...x })) : undefined;
    const notes = e.notes ? [...e.notes] : undefined;

    return {
        code: e.code,
        message: e.message,
        refs: e.refs ?? {},
        ...(evidence ? { evidence } : {}),
        ...(notes ? { notes } : {}),
    };
}

/**
 * Emit canonical JSON report:
 * - outcomes sorted by validation_id, then targets lexicographically
 * - errors sorted by code, then stable stringification of refs (keys sorted)
 * - all object keys sorted lexicographically at every depth
 */
export function emitCanonicalReport(report: CanonicalReport): string {
    // Normalize outcomes
    const outcomes = (report.outcomes ?? []).map(normalizeOutcome);

    outcomes.sort((a, b) => {
        const c1 = a.validation_id.localeCompare(b.validation_id);
        if (c1 !== 0) return c1;
        // Compare targets arrays lexicographically (string join is fine after sorting)
        const ta = a.targets.join("\u0000");
        const tb = b.targets.join("\u0000");
        return ta.localeCompare(tb);
    });

    // Normalize errors
    const errors = (report.errors ?? []).map(normalizeError);

    errors.sort((a, b) => {
        const c1 = a.code.localeCompare(b.code);
        if (c1 !== 0) return c1;
        const ra = stableStringify(a.refs ?? {});
        const rb = stableStringify(b.refs ?? {});
        return ra.localeCompare(rb);
    });

    // Build normalized top-level report
    const normalized: CanonicalReport = {
        spec_version: report.spec_version,
        system_id: report.system_id,
        state: report.state,
        outcomes,
        errors,
        ...(report.notes ? { notes: [...report.notes] } : {}),
        ...(report.extensions ? { extensions: report.extensions } : {}),
    };

    // Deep-sort keys for deterministic serialization
    const canonicalObj = deepSortKeys(normalized);

    // Pretty print with stable indentation (allowed; determinism preserved)
    return JSON.stringify(canonicalObj, null, 2);
}