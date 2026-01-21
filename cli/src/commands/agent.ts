import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readFileSync, createWriteStream, WriteStream } from 'node:fs';
import { spawn, ChildProcess } from 'node:child_process';
import { validate } from './validate.js';
import { verify } from './verify.js';
import { hashFile, writeFile, ensureDir } from '../utils.js';

// Resolve DIL_ROOT relative to executable location
// CLI is at cli/dist/commands/agent.js, root is ../../../
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DIL_ROOT = resolve(__dirname, '..', '..', '..');
const RUNS_DIR = resolve(DIL_ROOT, '.dil/runs');
const VALIDATOR_PARSE_PATH = resolve(DIL_ROOT, 'validator/dist/parse.js');

const ALLOWED_COMMANDS = new Set(['claude']);

const AGENT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const SIGTERM_GRACE_MS = 2000; // 2 seconds
const PROGRESS_INTERVAL_MS = 2000; // 2 seconds
const MAX_GATE_RETRIES = 3; // Max retries per gate
const STDERR_TAIL_BUFFER_SIZE = 64 * 1024; // 64 KB tail buffer for crash detection

// ============================================================================
// Failure Classification
// ============================================================================

/**
 * Failure kinds for agent execution.
 * UNKNOWN sub-categories with clear semantic meaning:
 * - unknown_verifier_limit: Spec is valid but verifier cannot parse/evaluate predicate (NOT retryable)
 * - unknown_agent_crash: LLM/agent process crashed (retryable)
 * - unknown_transient: Retryable but not deterministic (retryable)
 * - unknown_internal: Unexpected DIL internal error (NOT retryable)
 *
 * Deterministic outcomes (NOT retryable):
 * - verification_failed: Verification explicitly failed
 * - none: No failure (success)
 */
type FailureKind =
  | 'unknown_verifier_limit'
  | 'unknown_agent_crash'
  | 'unknown_transient'
  | 'unknown_internal'
  | 'verification_failed'
  | 'none';

/**
 * Gate status for outcome classification.
 */
type GateStatus = 'passed' | 'failed' | 'unknown';

/**
 * Human-readable explanations for UNKNOWN categories.
 * These are UX contract - must be clear and actionable.
 */
const UNKNOWN_EXPLANATIONS: Record<string, string> = {
  unknown_verifier_limit: 'predicate contains tokens not supported by current verifier',
  unknown_agent_crash: 'agent process crashed unexpectedly',
  unknown_transient: 'transient failure, may succeed on retry',
  unknown_internal: 'unexpected internal error in DIL',
};

/**
 * Transient failures that warrant a retry.
 * IMPORTANT: unknown_verifier_limit is NOT retryable (deterministic).
 */
const TRANSIENT_FAILURES: Set<FailureKind> = new Set([
  'unknown_agent_crash',
  'unknown_transient',
]);

/**
 * Detect if stderr contains the Claude "No messages returned" crash signature.
 */
function detectNoMessagesError(stderrContent: string): boolean {
  return stderrContent.includes('Error: No messages returned');
}

/**
 * Known verifier limit reasons from verify.ts.
 * These indicate the verifier cannot parse/evaluate, NOT a transient failure.
 */
const VERIFIER_LIMIT_REASONS = new Set([
  'malformed_token',
  'empty_predicate',
  'capability_mismatch',
  'empty_key',
  'missing_required_key',
  'unknown_key',
  'invalid_value',
  'invalid_path',
  'invalid_url',
  'invalid_scheme',
  'invalid_method',
  'unsupported_capability',
]);

/**
 * Detect if a verification reason indicates a verifier limit (not retryable).
 */
function isVerifierLimitReason(reason: string | undefined): boolean {
  if (!reason) return false;
  // Check if reason starts with any known verifier limit prefix
  for (const prefix of VERIFIER_LIMIT_REASONS) {
    if (reason.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// Types
// ============================================================================

interface ParsedIntent {
  id: string;
}

interface ParsedConstraint {
  id: string;
  severity?: string;
}

interface ParsedDecision {
  id: string;
  supports: string[];
  respects: string[];
}

interface ParsedValidation {
  id: string;
  requires_capability?: string;
}

interface ParsedSpec {
  spec_version: string;
  system_id: string;
  raw_text: string;
  intents: Map<string, ParsedIntent>;
  constraints: Map<string, ParsedConstraint>;
  decisions: Map<string, ParsedDecision>;
  validations: Map<string, ParsedValidation>;
}

interface ArtifactTitles {
  intents: Map<string, string>;
  constraints: Map<string, string>;
  decisions: Map<string, string>;
}

interface VerificationCheck {
  capability: string;
  check_id: string;
  params: Record<string, string>;
}

export interface AgentResult {
  exitCode: number;
  runDir?: string;
}

/**
 * Details for a single gate attempt.
 */
interface GateAttemptDetail {
  attemptNumber: number;
  gateStatus: GateStatus;
  failureKind: FailureKind;
  unknownReason: string | null;  // Human-readable explanation for UNKNOWN states
  retryReason: string | null;
  verificationState: string;
  spawnExitCode: number;
}

interface GateResult {
  gatePrefix: string;
  totalAttempts: number;
  finalStatus: GateStatus;
  finalFailureKind: FailureKind;
  finalUnknownReason: string | null;  // Final explanation for UNKNOWN states
  attempts: GateAttemptDetail[];
}

interface GatedExecutionResult {
  gatesDetected: string[];
  gateResults: GateResult[];
  allGatesPassed: boolean;
}

// ============================================================================
// Dynamic Import of Validator Parser
// ============================================================================

let parseDilFn: ((raw: string) => ParsedSpec) | null = null;

async function loadParser(): Promise<(raw: string) => ParsedSpec> {
  if (parseDilFn) return parseDilFn;

  try {
    const parserModule = await import(VALIDATOR_PARSE_PATH);
    const fn = parserModule.parseDil as (raw: string) => ParsedSpec;
    parseDilFn = fn;
    return fn;
  } catch (err) {
    throw new Error(`Failed to load validator parser: ${err}`);
  }
}

// ============================================================================
// Title Extraction
// ============================================================================

function extractArtifactTitles(rawText: string): ArtifactTitles {
  const intents = new Map<string, string>();
  const constraints = new Map<string, string>();
  const decisions = new Map<string, string>();

  const lines = rawText.split(/\r?\n/);

  for (const line of lines) {
    const stripped = line.replace(/#.*$/, '').trim();

    // intent I1 "Title Here" {
    const intentMatch = stripped.match(/^intent\s+([A-Za-z][A-Za-z0-9_]*)\s+"([^"]+)"/);
    if (intentMatch) {
      intents.set(intentMatch[1], intentMatch[2]);
    }

    // constraint C1 "Title Here" {
    const constraintMatch = stripped.match(/^constraint\s+([A-Za-z][A-Za-z0-9_]*)\s+"([^"]+)"/);
    if (constraintMatch) {
      constraints.set(constraintMatch[1], constraintMatch[2]);
    }

    // decision D1 "Title Here" {
    const decisionMatch = stripped.match(/^decision\s+([A-Za-z][A-Za-z0-9_]*)\s+"([^"]+)"/);
    if (decisionMatch) {
      decisions.set(decisionMatch[1], decisionMatch[2]);
    }
  }

  return { intents, constraints, decisions };
}

// ============================================================================
// Predicate Extraction (from verify.ts pattern)
// ============================================================================

function extractValidationPredicates(rawText: string): Map<string, string> {
  const predicates = new Map<string, string>();
  const lines = rawText.split(/\r?\n/);

  let currentValidationId: string | null = null;
  let braceDepth = 0;
  let inValidations = false;

  for (const line of lines) {
    const stripped = line.replace(/#.*$/, '').trim();

    // Detect validations section
    if (/^validations\s*\{/.test(stripped)) {
      inValidations = true;
      braceDepth = 1;
      continue;
    }

    if (!inValidations) continue;

    // Track brace depth
    for (const ch of stripped) {
      if (ch === '{') braceDepth++;
      else if (ch === '}') braceDepth--;
    }

    // Exit validations section
    if (braceDepth <= 0) {
      inValidations = false;
      continue;
    }

    // Match validate declaration
    const valMatch = stripped.match(/^validate\s+([A-Za-z][A-Za-z0-9_\-]*)\b/);
    if (valMatch) {
      currentValidationId = valMatch[1];
    }

    // Match predicate line
    if (currentValidationId) {
      const predMatch = stripped.match(/^predicate\s*:\s*"([^"]+)"/);
      if (predMatch) {
        predicates.set(currentValidationId, predMatch[1]);
      }
    }
  }

  return predicates;
}

// ============================================================================
// Param Parsing (from verify.ts pattern)
// ============================================================================

const VERIFICATION_CAPABILITIES = new Set([
  'check_file_exists',
  'check_command_exit',
  'check_http_endpoint',
]);

function parsePredicateParams(predicateText: string): Record<string, string> | null {
  const tokens = predicateText.trim().split(/\s+/);
  if (tokens.length === 0) return null;

  const params: Record<string, string> = {};

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    const eqIdx = token.indexOf('=');

    if (eqIdx === -1) continue;

    const key = token.slice(0, eqIdx);
    const value = token.slice(eqIdx + 1);

    if (key) {
      params[key] = value;
    }
  }

  return params;
}

function extractVerificationChecks(
  parsedSpec: ParsedSpec,
  rawText: string
): VerificationCheck[] {
  const predicates = extractValidationPredicates(rawText);
  const checks: VerificationCheck[] = [];

  for (const [validationId, validation] of parsedSpec.validations) {
    const capability = validation.requires_capability;

    if (!capability || !VERIFICATION_CAPABILITIES.has(capability)) {
      continue;
    }

    const predicateText = predicates.get(validationId);
    if (!predicateText) continue;

    const firstToken = predicateText.trim().split(/\s+/)[0];
    if (firstToken !== capability) continue;

    const params = parsePredicateParams(predicateText);
    if (!params) continue;

    checks.push({
      capability,
      check_id: `validations.${validationId}`,
      params,
    });
  }

  // Sort by check_id for determinism
  checks.sort((a, b) => a.check_id.localeCompare(b.check_id));

  return checks;
}

// ============================================================================
// Deterministic Run ID
// ============================================================================

function generateAgentRunId(specHash: string, cmd: string, argv: string[]): string {
  const cmdPayload = JSON.stringify({ argv, cmd });
  const cmdHash = createHash('sha256').update(cmdPayload).digest('hex');
  return `${specHash.slice(0, 16)}-${cmdHash.slice(0, 16)}`;
}

// ============================================================================
// Deterministic JSON
// ============================================================================

function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }

  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  for (const key of keys) {
    sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

function buildDeterministicJson(obj: unknown): string {
  return JSON.stringify(sortObjectKeys(obj), null, 2);
}

// ============================================================================
// Gate Detection
// ============================================================================

/**
 * Extracts gate prefixes from validation IDs.
 * Gate convention: V_GATE_NN_* where NN is a zero-padded number.
 * Returns sorted list of unique gate prefixes (e.g., ['V_GATE_01_', 'V_GATE_02_'])
 */
function extractGates(parsedSpec: ParsedSpec): string[] {
  const gatePattern = /^(V_GATE_\d{2}_)/;
  const gatePrefixes = new Set<string>();

  for (const [validationId] of parsedSpec.validations) {
    const match = validationId.match(gatePattern);
    if (match) {
      gatePrefixes.add(match[1]);
    }
  }

  // Sort numerically by the gate number
  return Array.from(gatePrefixes).sort((a, b) => {
    const numA = parseInt(a.match(/\d{2}/)![0], 10);
    const numB = parseInt(b.match(/\d{2}/)![0], 10);
    return numA - numB;
  });
}

// ============================================================================
// Claude Prompt Validation
// ============================================================================

interface ClaudeValidationResult {
  valid: boolean;
  error?: string;
  modifiedArgv?: string[];
}

function validateClaudeArgs(argv: string[]): ClaudeValidationResult {
  // Check for -p or --print flag
  const hasPrintFlag = argv.some(arg => arg === '-p' || arg === '--print');

  if (!hasPrintFlag) {
    return {
      valid: false,
      error: 'claude must be invoked in print mode (-p/--print)',
    };
  }

  // Find the index of -p or --print
  const printIndex = argv.findIndex(arg => arg === '-p' || arg === '--print');

  // Count arguments after -p/--print that are not flags (don't start with -)
  // The prompt should be the last argument and should be a single quoted string
  const argsAfterPrint = argv.slice(printIndex + 1);
  const nonFlagArgs = argsAfterPrint.filter(arg => !arg.startsWith('-') && !arg.startsWith('--'));

  // If there are multiple non-flag arguments after -p, the prompt wasn't properly quoted
  if (nonFlagArgs.length > 1) {
    return {
      valid: false,
      error: 'prompt must be a single quoted argument',
    };
  }

  // Check if --output-format is present, if not add it
  const hasOutputFormat = argv.some(arg => arg === '--output-format' || arg.startsWith('--output-format='));

  let modifiedArgv = [...argv];
  if (!hasOutputFormat) {
    // Insert --output-format text before the prompt (last non-flag arg)
    // Find where to insert: after -p but before the prompt
    const insertIndex = printIndex + 1;
    modifiedArgv = [
      ...argv.slice(0, insertIndex),
      '--output-format',
      'text',
      ...argv.slice(insertIndex),
    ];
  }

  return { valid: true, modifiedArgv };
}

// ============================================================================
// Spawn with File Streams and Progress Indicator
// ============================================================================

interface SpawnWithStreamsResult {
  exitCode: number;
  timedOut: boolean;
  killed: boolean;
  stderrTail: string; // Last N bytes of stderr for crash detection
}

/**
 * Maintains a rolling tail buffer of the last N bytes.
 */
class TailBuffer {
  private buffer: string = '';
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  append(chunk: string): void {
    this.buffer += chunk;
    if (this.buffer.length > this.maxSize) {
      this.buffer = this.buffer.slice(-this.maxSize);
    }
  }

  getContent(): string {
    return this.buffer;
  }
}

function spawnWithStreams(
  cmd: string,
  argv: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  stdoutStream: WriteStream,
  stderrStream: WriteStream,
  gateNum?: string,
  attemptNum?: number
): Promise<SpawnWithStreamsResult> {
  return new Promise((resolve) => {
    let timedOut = false;
    let killed = false;
    let killTimer: NodeJS.Timeout | null = null;
    let progressTimer: NodeJS.Timeout | null = null;

    // Tail buffer for stderr crash detection
    const stderrTailBuffer = new TailBuffer(STDERR_TAIL_BUFFER_SIZE);

    const child: ChildProcess = spawn(cmd, argv, {
      shell: false,
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const pid = child.pid;

    // Pipe stdout to file stream
    if (child.stdout) {
      child.stdout.pipe(stdoutStream);
    }

    // Pipe stderr to file stream AND capture tail buffer
    if (child.stderr) {
      child.stderr.on('data', (chunk: Buffer) => {
        const chunkStr = chunk.toString();
        stderrTailBuffer.append(chunkStr);
        stderrStream.write(chunk);
      });
    }

    // Progress indicator every 2 seconds
    progressTimer = setInterval(() => {
      if (gateNum !== undefined && attemptNum !== undefined) {
        process.stderr.write(`dil agent: running (pid=${pid}, gate=${gateNum}, attempt=${attemptNum})\n`);
      } else {
        process.stderr.write(`dil agent: running (pid=${pid})\n`);
      }
    }, PROGRESS_INTERVAL_MS);

    // Timeout handler
    const timer = setTimeout(() => {
      timedOut = true;

      // Write timeout message to stderr log
      stderrStream.write('\n[DIL AGENT TIMEOUT] Agent exceeded 30 minute timeout. Sending SIGTERM...\n');

      child.kill('SIGTERM');

      killTimer = setTimeout(() => {
        killed = true;
        stderrStream.write('[DIL AGENT TIMEOUT] Grace period expired. Sending SIGKILL...\n');
        child.kill('SIGKILL');
      }, SIGTERM_GRACE_MS);
    }, AGENT_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      if (progressTimer) clearInterval(progressTimer);
    };

    child.on('close', (code) => {
      cleanup();
      resolve({
        exitCode: code ?? 1,
        timedOut,
        killed,
        stderrTail: stderrTailBuffer.getContent(),
      });
    });

    child.on('error', (err) => {
      cleanup();
      const errorMsg = `[DIL AGENT ERROR] Spawn error: ${err.message}\n`;
      stderrStream.write(errorMsg);
      stderrTailBuffer.append(errorMsg);
      resolve({
        exitCode: 1,
        timedOut: false,
        killed: false,
        stderrTail: stderrTailBuffer.getContent(),
      });
    });
  });
}

// ============================================================================
// Single Pass Execution Helper
// ============================================================================

interface SinglePassResult {
  spawnExitCode: number;
  timedOut: boolean;
  specHashAfter: string;
  verificationState: string;
  verificationApplicable: boolean;
  verificationSpecHash: string;
  failureKind: FailureKind;
  gateStatus: GateStatus;
  agentCrashed: boolean;
  unknownReason: string | null;  // Human-readable explanation for UNKNOWN states
  verifierLimitReason: string | null;  // Raw reason from verifier if limit detected
}

async function executeSinglePass(
  cmd: string,
  argv: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  runDir: string,
  absoluteSpecPath: string,
  specHashBefore: string,
  passNumber: number,
  gatePrefix?: string
): Promise<SinglePassResult> {
  const passSuffix = gatePrefix ? `.gate${gatePrefix.match(/\d{2}/)![0]}.pass${passNumber}` : `.pass${passNumber}`;

  // Create pass-specific log files
  const stdoutLogPath = resolve(runDir, `agent${passSuffix}.stdout.log`);
  const stderrLogPath = resolve(runDir, `agent${passSuffix}.stderr.log`);

  writeFile(stdoutLogPath, '');
  writeFile(stderrLogPath, '');

  const stdoutStream = createWriteStream(stdoutLogPath);
  const stderrStream = createWriteStream(stderrLogPath);


  // Check for test hook: DIL_TEST_FORCE_NO_MESSAGES
  const forceNoMessages = env.DIL_TEST_FORCE_NO_MESSAGES === '1';

  let spawnResult: SpawnWithStreamsResult;

  if (forceNoMessages) {
    // Simulate Claude crash with "No messages returned"
    process.stderr.write(`dil agent: [TEST HOOK] Simulating "No messages returned" crash\n`);
    const simulatedError = 'Error: No messages returned\n';
    stderrStream.write(simulatedError);

    // Wait for stream to finish
    await new Promise<void>(resolve => {
      stderrStream.end(() => resolve());
    });
    stdoutStream.end();

    spawnResult = {
      exitCode: 1,
      timedOut: false,
      killed: false,
      stderrTail: simulatedError,
    };
  } else {
    const gateNumMatch = gatePrefix?.match(/\d{2}/);
    spawnResult = await spawnWithStreams(cmd, argv, cwd, env, stdoutStream, stderrStream, gateNumMatch?.[0], passNumber);

    // Wait for streams to finish writing
    const stdoutFinished = new Promise<void>(resolve => {
      if (stdoutStream.writableFinished) {
        resolve();
      } else {
        stdoutStream.on('finish', resolve);
      }
    });
    const stderrFinished = new Promise<void>(resolve => {
      if (stderrStream.writableFinished) {
        resolve();
      } else {
        stderrStream.on('finish', resolve);
      }
    });

    stdoutStream.end();
    stderrStream.end();
    await Promise.all([stdoutFinished, stderrFinished]);
  }

  // Detect agent crash: "No messages returned"
  const hasNoMessagesError = detectNoMessagesError(spawnResult.stderrTail);
  const agentCrashed = hasNoMessagesError;

  if (agentCrashed) {
    // Append crash marker to stderr log for clarity
    const crashMarker = '\n[DIL AGENT CRASH] Detected fatal error: "No messages returned"\n';
    const crashLogPath = resolve(runDir, `agent${passSuffix}.stderr.log`);
    try {
      const existingContent = readFileSync(crashLogPath, 'utf8');
      writeFile(crashLogPath, existingContent + crashMarker);
    } catch {
      // Ignore if we can't append
    }
    process.stderr.write(`dil agent: CRASH detected - "No messages returned"\n`);
  }

  // Record spec_hash_after
  const specHashAfter = hashFile(absoluteSpecPath);

  // Run verification (optionally filtered by gate prefix)
  const verifyOptions: { out: string; onlyCheckPrefix?: string[] } = {
    out: resolve(runDir, `verification${passSuffix}.json`),
  };
  if (gatePrefix) {
    verifyOptions.onlyCheckPrefix = [gatePrefix];
  }

  await verify(absoluteSpecPath, verifyOptions);

  // Read verification result
  let verificationSpecHash = '';
  let verificationState = 'unknown';
  let verifierLimitReason: string | null = null;
  let hasVerifierLimit = false;

  try {
    const verifyReceiptContent = readFileSync(verifyOptions.out, 'utf8');
    const verifyReceipt = JSON.parse(verifyReceiptContent);
    verificationSpecHash = verifyReceipt.spec_hash || '';

    if (verifyReceipt.state === 'verified') {
      verificationState = 'verified';
    } else if (verifyReceipt.state === 'unverified') {
      verificationState = 'unverified';
    } else {
      verificationState = 'unknown';
    }

    // Check for verifier limit in any check with status='unknown'
    if (verifyReceipt.checks && Array.isArray(verifyReceipt.checks)) {
      for (const check of verifyReceipt.checks) {
        if (check.status === 'unknown' && check.reason) {
          if (isVerifierLimitReason(check.reason)) {
            hasVerifierLimit = true;
            verifierLimitReason = check.reason;
            break;
          }
        }
      }
    }
  } catch {
    verificationState = 'unknown';
  }

  // Determine verification applicability
  const verificationApplicable =
    specHashBefore === verificationSpecHash &&
    specHashBefore === specHashAfter;

  // Classify failure kind and gate status
  let failureKind: FailureKind = 'none';
  let gateStatus: GateStatus = 'unknown';
  let unknownReason: string | null = null;

  if (agentCrashed) {
    failureKind = 'unknown_agent_crash';
    gateStatus = 'unknown';
    unknownReason = UNKNOWN_EXPLANATIONS.unknown_agent_crash;
  } else if (spawnResult.timedOut) {
    failureKind = 'unknown_transient';
    gateStatus = 'unknown';
    unknownReason = 'agent exceeded timeout limit';
  } else if (verificationApplicable && verificationState === 'verified') {
    failureKind = 'none';
    gateStatus = 'passed';
  } else if (verificationApplicable && verificationState === 'unverified') {
    // Deterministic verification failure - do NOT retry
    failureKind = 'verification_failed';
    gateStatus = 'failed';
  } else if (hasVerifierLimit) {
    // Verifier cannot parse/evaluate predicate - do NOT retry
    failureKind = 'unknown_verifier_limit';
    gateStatus = 'unknown';
    unknownReason = UNKNOWN_EXPLANATIONS.unknown_verifier_limit;
  } else if (!verificationApplicable) {
    // Spec changed or hash mismatch - internal issue
    failureKind = 'unknown_internal';
    gateStatus = 'unknown';
    unknownReason = UNKNOWN_EXPLANATIONS.unknown_internal;
  } else {
    // Unknown state - may be transient
    failureKind = 'unknown_transient';
    gateStatus = 'unknown';
    unknownReason = UNKNOWN_EXPLANATIONS.unknown_transient;
  }

  return {
    spawnExitCode: spawnResult.exitCode,
    timedOut: spawnResult.timedOut,
    specHashAfter,
    verificationState,
    verificationApplicable,
    verificationSpecHash,
    failureKind,
    gateStatus,
    agentCrashed,
    unknownReason,
    verifierLimitReason,
  };
}

// ============================================================================
// Main Agent Function
// ============================================================================

export async function agent(
  specPath: string,
  cmd: string,
  argv: string[]
): Promise<AgentResult> {
  const absoluteSpecPath = resolve(specPath);

  // 1. Validate command in allowlist
  if (!ALLOWED_COMMANDS.has(cmd)) {
    process.stderr.write(`Error: unknown command "${cmd}"\n`);
    return { exitCode: 1 };
  }

  // 2. Validate Claude-specific arguments
  let finalArgv = argv;
  if (cmd === 'claude') {
    const claudeValidation = validateClaudeArgs(argv);
    if (!claudeValidation.valid) {
      process.stderr.write(`Error: ${claudeValidation.error}\n`);
      return { exitCode: 1 };
    }
    finalArgv = claudeValidation.modifiedArgv || argv;
  }

  // 3. Run validation
  const validateResult = await validate(absoluteSpecPath, {});

  if (validateResult.exitCode !== 0) {
    process.stderr.write('Spec validation failed\n');
    return { exitCode: validateResult.exitCode };
  }

  // 4. Record spec_hash_before
  const specHashBefore = hashFile(absoluteSpecPath);

  // 5. Compute deterministic run ID (use original argv for determinism)
  const runId = generateAgentRunId(specHashBefore, cmd, argv);
  const runDir = resolve(RUNS_DIR, runId);

  // 6. Create run directory
  ensureDir(runDir);

  // 7. Pre-create lifecycle files
  const exitCodePath = resolve(runDir, 'agent.exit_code');
  const startedPath = resolve(runDir, 'agent.started');
  const finishedPath = resolve(runDir, 'agent.finished');
  const verificationReceiptPath = resolve(runDir, 'verification.json');

  writeFile(exitCodePath, '-1');
  writeFile(startedPath, 'started');

  // 8. Parse spec for summaries
  let parseDil: (raw: string) => ParsedSpec;
  try {
    parseDil = await loadParser();
  } catch (err) {
    process.stderr.write(`Error loading parser: ${err}\n`);
    writeFile(exitCodePath, '2');
    writeFile(finishedPath, '2');
    return { exitCode: 2 };
  }

  const rawSpec = readFileSync(absoluteSpecPath, 'utf8');
  const parsedSpec = parseDil(rawSpec);
  const titles = extractArtifactTitles(rawSpec);
  const verificationChecks = extractVerificationChecks(parsedSpec, rawSpec);

  // Build summaries
  const intentsSummary: Array<{ id: string; title: string }> = [];
  for (const [id] of parsedSpec.intents) {
    intentsSummary.push({ id, title: titles.intents.get(id) || '' });
  }

  const constraintsSummary: Array<{ id: string; title: string }> = [];
  for (const [id] of parsedSpec.constraints) {
    constraintsSummary.push({ id, title: titles.constraints.get(id) || '' });
  }

  const decisionsSummary: Array<{ id: string; respects: string[]; supports: string[] }> = [];
  for (const [id, decision] of parsedSpec.decisions) {
    decisionsSummary.push({
      id,
      respects: decision.respects,
      supports: decision.supports,
    });
  }

  // 9. Detect gates
  const gates = extractGates(parsedSpec);
  const hasGates = gates.length > 0;

  if (hasGates) {
    process.stderr.write(`dil agent: detected ${gates.length} gate(s)\n`);
  }

  // 10. Write agent_request.json
  const agentRequest = {
    constraints_summary: constraintsSummary,
    decisions_summary: decisionsSummary,
    gates: hasGates ? gates : undefined,
    intents_summary: intentsSummary,
    receipts: {
      validation_receipt_path: validateResult.receiptPath,
      verification_receipt_path: verificationReceiptPath,
    },
    spec_hash: specHashBefore,
    spec_path: absoluteSpecPath,
    system_id: parsedSpec.system_id,
    task: {
      argv: finalArgv,
      cmd,
    },
    verification_checks: verificationChecks,
  };

  writeFile(resolve(runDir, 'agent_request.json'), buildDeterministicJson(agentRequest));

  // 11. Prepare environment
  const env = {
    ...process.env,
    DIL_SPEC_PATH: absoluteSpecPath,
    DIL_RECEIPT_PATH: validateResult.receiptPath,
    DIL_RUN_DIR: runDir,
  };

  const warnings: string[] = [];
  let lastPassResult: SinglePassResult | null = null;
  let gatedExecution: GatedExecutionResult | undefined;
  let totalPasses = 0;

  if (hasGates) {
    // ========================================================================
    // GATED MULTI-PASS EXECUTION
    // ========================================================================
    const gateResults: GateResult[] = [];
    let allGatesPassed = true;

    for (const gatePrefix of gates) {
      const gateNum = gatePrefix.match(/\d{2}/)![0];
      process.stderr.write(`dil agent: gate ${gateNum}: running\n`);

      let gatePassed = false;
      const attemptDetails: GateAttemptDetail[] = [];
      let finalStatus: GateStatus = 'unknown';
      let finalFailureKind: FailureKind = 'none';
      let finalUnknownReason: string | null = null;

      for (let attempt = 1; attempt <= MAX_GATE_RETRIES && !gatePassed; attempt++) {
        totalPasses++;

        // Print running message with attempt info if this is a retry
        if (attempt > 1) {
          process.stderr.write(`dil agent: gate ${gateNum}: running (attempt ${attempt}/${MAX_GATE_RETRIES})\n`);
        }

        // Add gate context to environment
        const gateEnv = {
          ...env,
          DIL_CURRENT_GATE: gatePrefix,
          DIL_GATE_ATTEMPT: String(attempt),
        };

        const startTime = Date.now();
        lastPassResult = await executeSinglePass(
          cmd,
          finalArgv,
          runDir,
          gateEnv,
          runDir,
          absoluteSpecPath,
          specHashBefore,
          totalPasses,
          gatePrefix
        );
        const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);

        const { failureKind, gateStatus, verificationState, spawnExitCode, unknownReason } = lastPassResult;

        // Determine if we should retry
        const isTransient = TRANSIENT_FAILURES.has(failureKind);
        const canRetry = attempt < MAX_GATE_RETRIES && isTransient;
        let retryReason: string | null = null;

        if (gateStatus === 'passed') {
          gatePassed = true;
          process.stderr.write(`dil agent: gate ${gateNum}: PASSED (${elapsedSeconds}s)\n`);
        } else if (failureKind === 'unknown_agent_crash') {
          // UNKNOWN (agent_crash) - retryable
          process.stderr.write(`dil agent: gate ${gateNum}: UNKNOWN (agent_crash)\n`);
          process.stderr.write(`reason: ${unknownReason}\n`);
          warnings.push(`gate_${gateNum}_agent_crash_attempt_${attempt}`);
          if (canRetry) {
            retryReason = 'retryable: agent crash';
            process.stderr.write(`retrying gate ${gateNum} (attempt ${attempt + 1}/${MAX_GATE_RETRIES})\n`);
          }
        } else if (failureKind === 'unknown_verifier_limit') {
          // UNKNOWN (verifier_limit) - NOT retryable
          process.stderr.write(`dil agent: gate ${gateNum}: UNKNOWN (verifier_limit)\n`);
          process.stderr.write(`reason: ${unknownReason}\n`);
          warnings.push(`gate_${gateNum}_verifier_limit`);
          // Do NOT retry - this is deterministic
        } else if (failureKind === 'unknown_internal') {
          // UNKNOWN (internal) - NOT retryable
          process.stderr.write(`dil agent: gate ${gateNum}: UNKNOWN (internal)\n`);
          process.stderr.write(`reason: ${unknownReason}\n`);
          warnings.push(`gate_${gateNum}_internal_error`);
          // Do NOT retry - this is an internal error
        } else if (failureKind === 'unknown_transient') {
          // UNKNOWN (transient) - retryable
          process.stderr.write(`dil agent: gate ${gateNum}: UNKNOWN (transient)\n`);
          process.stderr.write(`reason: ${unknownReason}\n`);
          warnings.push(`gate_${gateNum}_unknown_attempt_${attempt}`);
          if (canRetry) {
            retryReason = 'retryable: transient failure';
            process.stderr.write(`retrying gate ${gateNum} (attempt ${attempt + 1}/${MAX_GATE_RETRIES})\n`);
          }
        } else if (failureKind === 'verification_failed') {
          // FAILED - NOT retryable
          process.stderr.write(`dil agent: gate ${gateNum}: FAILED\n`);
          process.stderr.write(`reason: verification check failed\n`);
          warnings.push(`gate_${gateNum}_verification_failed`);
          // Do NOT retry - this is deterministic
        } else {
          process.stderr.write(`dil agent: gate ${gateNum}: ${gateStatus.toUpperCase()} (${failureKind})\n`);
        }

        attemptDetails.push({
          attemptNumber: attempt,
          gateStatus,
          failureKind,
          unknownReason,
          retryReason,
          verificationState,
          spawnExitCode,
        });

        finalStatus = gateStatus;
        finalFailureKind = failureKind;
        finalUnknownReason = unknownReason;

        // Stop retrying if this is NOT a transient failure
        if (!isTransient) {
          break;
        }
      }

      gateResults.push({
        gatePrefix,
        totalAttempts: attemptDetails.length,
        finalStatus,
        finalFailureKind,
        finalUnknownReason,
        attempts: attemptDetails,
      });

      if (!gatePassed) {
        allGatesPassed = false;
        warnings.push(`gate_${gateNum}_failed_after_${attemptDetails.length}_attempts`);
        break; // Stop processing further gates
      }
    }

    gatedExecution = {
      gatesDetected: gates,
      gateResults,
      allGatesPassed,
    };

    // Run final full verification if all gates passed
    if (allGatesPassed) {
      process.stderr.write('dil agent: all gates passed, running final verification\n');
      await verify(absoluteSpecPath, { out: verificationReceiptPath });
    } else {
      // Copy the last gate verification as the final verification
      if (lastPassResult) {
        const lastGateNum = gateResults[gateResults.length - 1]?.gatePrefix.match(/\d{2}/)?.[0] || '01';
        const lastPassNum = totalPasses;
        const lastGateVerificationPath = resolve(runDir, `verification.gate${lastGateNum}.pass${lastPassNum}.json`);
        try {
          const lastVerification = readFileSync(lastGateVerificationPath, 'utf8');
          writeFile(verificationReceiptPath, lastVerification);
        } catch {
          // If we can't copy, create a minimal unverified receipt
          const minimalReceipt = {
            spec_hash: specHashBefore,
            state: 'unverified',
            validation_receipt_ref: validateResult.receiptPath,
          };
          writeFile(verificationReceiptPath, buildDeterministicJson(minimalReceipt));
        }
      }
    }
  } else {
    // ========================================================================
    // SINGLE-PASS EXECUTION (no gates)
    // ========================================================================
    totalPasses = 1;
    lastPassResult = await executeSinglePass(
      cmd,
      finalArgv,
      runDir,
      env,
      runDir,
      absoluteSpecPath,
      specHashBefore,
      1
    );

    // Copy single-pass verification to final verification path
    const singlePassVerificationPath = resolve(runDir, 'verification.pass1.json');
    try {
      const singleVerification = readFileSync(singlePassVerificationPath, 'utf8');
      writeFile(verificationReceiptPath, singleVerification);
    } catch {
      // Create minimal receipt on error
      const minimalReceipt = {
        spec_hash: specHashBefore,
        state: 'unknown',
        validation_receipt_ref: validateResult.receiptPath,
      };
      writeFile(verificationReceiptPath, buildDeterministicJson(minimalReceipt));
    }
  }

  // 12. Record final spec hash
  const specHashAfter = lastPassResult?.specHashAfter || hashFile(absoluteSpecPath);
  const specChanged = specHashBefore !== specHashAfter;

  // 13. Read final verification receipt
  let verificationSpecHash = '';
  let verificationState = 'unknown';
  let validationReceiptRefFromVerify = '';

  try {
    const verifyReceiptContent = readFileSync(verificationReceiptPath, 'utf8');
    const verifyReceipt = JSON.parse(verifyReceiptContent);

    verificationSpecHash = verifyReceipt.spec_hash || '';
    validationReceiptRefFromVerify = verifyReceipt.validation_receipt_ref || '';

    if (verifyReceipt.state === 'verified') {
      verificationState = 'verified';
    } else if (verifyReceipt.state === 'unverified') {
      verificationState = 'unverified';
    } else {
      verificationState = 'unknown';
    }

    if (!specChanged && validationReceiptRefFromVerify === 'missing') {
      process.stderr.write('Warning: validation receipt missing after agent run (internal inconsistency)\n');
      warnings.push('validation_receipt_ref_missing_unexpectedly');
    }
  } catch {
    warnings.push('verification_receipt_unreadable');
    verificationState = 'unknown';
  }

  if (specChanged) {
    warnings.push('spec_modified_during_execution');
  }

  if (lastPassResult?.timedOut) {
    warnings.push('agent_timeout');
  }

  if (lastPassResult?.agentCrashed) {
    warnings.push('agent_crash');
  }

  if (lastPassResult?.failureKind === 'unknown_verifier_limit') {
    warnings.push('verifier_limit');
  }

  // 14. Determine verification applicability
  const verificationApplicable =
    specHashBefore === verificationSpecHash &&
    specHashBefore === specHashAfter;

  // 15. Determine final_state and failure_kind for receipt
  // Rules:
  // - Any "unknown" gate → completed_unknown (exit 2)
  // - Any "failed" gate (deterministic) → completed_unverified (exit 1)
  // - All gates passed → completed_verified (exit 0)
  let finalState: string;
  let exitCode: number;
  let finalFailureKind: FailureKind = lastPassResult?.failureKind ?? 'none';
  let finalUnknownReason: string | null = lastPassResult?.unknownReason ?? null;

  if (lastPassResult?.gateStatus === 'unknown') {
    finalState = 'completed_unknown';
    exitCode = 2;
  } else if (lastPassResult?.gateStatus === 'failed') {
    finalState = 'completed_unverified';
    exitCode = 1;
  } else if (lastPassResult?.gateStatus === 'passed' || verificationState === 'verified') {
    finalState = 'completed_verified';
    exitCode = 0;
    finalFailureKind = 'none';
    finalUnknownReason = null;
  } else if (verificationState === 'unverified') {
    finalState = 'completed_unverified';
    exitCode = 1;
    finalFailureKind = 'verification_failed';
  } else {
    finalState = 'completed_unknown';
    exitCode = 2;
  }

  // 16. Write agent exit code
  writeFile(exitCodePath, String(lastPassResult?.spawnExitCode ?? 1));

  // 17. Write run_receipt.json
  const runReceipt: Record<string, unknown> = {
    agent: {
      argv: finalArgv,
      cmd,
      exit_code: lastPassResult?.spawnExitCode ?? 1,
    },
    exit_code: exitCode,
    failure_kind: finalFailureKind,
    final_state: finalState,
    receipt_type: 'agent_run',
    run_dir: runDir,
    spec_hash_after: specHashAfter,
    spec_hash_before: specHashBefore,
    system_id: parsedSpec.system_id,
    total_passes: totalPasses,
    unknown_reason: finalUnknownReason,
    validation_receipt_ref: validateResult.receiptPath,
    verification: {
      applicable: verificationApplicable,
      receipt_ref: verificationReceiptPath,
      spec_hash_verified: verificationSpecHash,
      state: verificationState,
    },
    warnings,
  };

  // Add gated execution details if gates were used
  if (gatedExecution) {
    runReceipt.gated_execution = {
      all_gates_passed: gatedExecution.allGatesPassed,
      gate_results: gatedExecution.gateResults.map(gr => ({
        attempts: gr.attempts.map(a => ({
          attempt_number: a.attemptNumber,
          failure_kind: a.failureKind,
          gate_status: a.gateStatus,
          retry_reason: a.retryReason,
          spawn_exit_code: a.spawnExitCode,
          unknown_reason: a.unknownReason,
          verification_state: a.verificationState,
        })),
        final_failure_kind: gr.finalFailureKind,
        final_status: gr.finalStatus,
        final_unknown_reason: gr.finalUnknownReason,
        gate_prefix: gr.gatePrefix,
        total_attempts: gr.totalAttempts,
      })),
      gates_detected: gatedExecution.gatesDetected,
    };
  }

  writeFile(resolve(runDir, 'run_receipt.json'), buildDeterministicJson(runReceipt));

  // 18. Write agent.finished
  writeFile(finishedPath, String(exitCode));

  // 19. Print final status to stderr
  if (exitCode === 0) {
    process.stderr.write('dil agent: COMPLETED\n');
  } else if (exitCode === 1) {
    process.stderr.write('dil agent: FAILED\n');
  } else {
    process.stderr.write('dil agent: UNKNOWN\n');
  }

  // 20. Print run_dir to stdout
  console.log(runDir);

  return { exitCode, runDir };
}
