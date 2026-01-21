#!/usr/bin/env node
/* DIL Core Reference Validator — CLI entrypoint */

import { readFileSync } from "fs";
import { parseDil } from "./parse.js";
import { validateCore } from "./validate.js";
import { emitCanonicalReport } from "./report.js";

type ExitCode = 0 | 1 | 2;

function usage(): void {
    // Keep stdout clean for canonical JSON; usage goes to stderr.
    console.error("Usage: dil-validate <path/to/spec.dil>");
}

function main(): ExitCode {
    const specPath = process.argv[2];
    if (!specPath) {
        usage();
        return 1;
    }

    let inputText = "";
    try {
        inputText = readFileSync(specPath, "utf8");
    } catch (err: any) {
        const report = emitCanonicalReport({
            spec_version: "unknown",
            system_id: "unknown",
            state: "invalid",
            outcomes: [],
            errors: [
                {
                    code: "PARSE_ERROR",
                    message: "Unable to read input file.",
                    refs: {
                        location: specPath,
                        hint: err?.message ?? "read failure"
                    }
                }
            ]
        });
        process.stdout.write(report + "\n");
        return 1;
    }

    const parsed = parseDil(inputText);
    const result = validateCore(parsed);
    const json = emitCanonicalReport(result.report);

    process.stdout.write(json + "\n");
    return result.exit_code as ExitCode;
}

process.exit(main());