import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import * as http from 'node:http';
import * as https from 'node:https';
import { URL } from 'node:url';
import { hashFile, writeFile } from '../utils.js';

// Resolve DIL_ROOT relative to executable location
// CLI is at cli/dist/commands/verify.js, root is ../../../
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DIL_ROOT = resolve(__dirname, '..', '..', '..');
const VALIDATOR_PARSE_PATH = resolve(DIL_ROOT, 'validator/dist/parse.js');
const VERIFICATION_DIR = resolve(DIL_ROOT, '.dil/verification');
const RECEIPTS_DIR = resolve(DIL_ROOT, '.dil/receipts');

const VERIFICATION_CAPABILITIES = new Set([
  'check_file_exists',
  'check_command_exit',
  'check_http_endpoint',
]);

// ============================================================================
// Types
// ============================================================================

type CheckStatus = 'passed' | 'failed' | 'unknown';

interface CheckEvidence {
  [key: string]: string | number | boolean | undefined;
}

interface Check {
  capability: string;
  check_id: string;
  evidence?: CheckEvidence;
  reason?: string;
  status: CheckStatus;
}

interface VerificationReceipt {
  checks: Check[];
  receipt_type: 'verification';
  receipt_version: 'DIL:verify v0';
  spec_hash: string;
  spec_version: string;
  state: 'verified' | 'unverified' | 'unknown';
  system_id: string;
  validation_receipt_ref: string;
}

interface ParsedParams {
  [key: string]: string;
}

type ParamParseResult =
  | { ok: true; params: ParsedParams }
  | { ok: false; reason: string };

type ParamValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

interface ValidationPredicate {
  validationId: string;
  capability: string;
  predicateText: string;
}

interface ParsedValidation {
  id: string;
  requires_capability?: string;
}

interface ParsedSpec {
  spec_version: string;
  system_id: string;
  raw_text: string;
  validations: Map<string, ParsedValidation>;
}

export interface VerifyOptions {
  out?: string;
  onlyCheckPrefix?: string[];  // Filter by validation ID prefix (e.g., "V_GATE_01_")
  onlyCheckIds?: string[];     // Filter by exact validation IDs
}

export interface VerifyResult {
  exitCode: number;
  receiptPath: string;
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
// Predicate Extraction
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
// Param Parsing
// ============================================================================

function parsePredicateParams(
  predicateText: string,
  expectedCapability: string
): ParamParseResult {
  const tokens = predicateText.trim().split(/\s+/);

  if (tokens.length === 0) {
    return { ok: false, reason: 'empty_predicate' };
  }

  const capabilityToken = tokens[0];
  if (capabilityToken !== expectedCapability) {
    return { ok: false, reason: `capability_mismatch:expected=${expectedCapability},actual=${capabilityToken}` };
  }

  const params: ParsedParams = {};

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    const eqIdx = token.indexOf('=');

    if (eqIdx === -1) {
      return { ok: false, reason: `malformed_token:${token}` };
    }

    const key = token.slice(0, eqIdx);
    const value = token.slice(eqIdx + 1);

    if (!key) {
      return { ok: false, reason: `empty_key:${token}` };
    }

    params[key] = value;
  }

  return { ok: true, params };
}

// ============================================================================
// Parameter Validation
// ============================================================================

const FILE_EXISTS_REQUIRED = ['path'];
const FILE_EXISTS_KNOWN = new Set(['path', 'type', 'min_size_bytes']);

const COMMAND_EXIT_REQUIRED = ['cmd', 'args'];
const COMMAND_EXIT_KNOWN = new Set(['cmd', 'args', 'expected_exit', 'timeout_ms']);

const HTTP_ENDPOINT_REQUIRED = ['url'];
const HTTP_ENDPOINT_KNOWN = new Set(['url', 'method', 'expected_status', 'timeout_ms']);

function validateFileExistsParams(params: ParsedParams): ParamValidationResult {
  // Check required keys
  for (const key of FILE_EXISTS_REQUIRED) {
    if (!(key in params)) {
      return { ok: false, reason: `missing_required_key:${key}` };
    }
  }

  // Check for unknown keys
  for (const key of Object.keys(params)) {
    if (!FILE_EXISTS_KNOWN.has(key)) {
      return { ok: false, reason: `unknown_key:${key}` };
    }
  }

  // Validate path is absolute
  if (!params.path.startsWith('/')) {
    return { ok: false, reason: 'invalid_path:not_absolute' };
  }

  // Validate type if provided
  if (params.type && params.type !== 'file' && params.type !== 'directory') {
    return { ok: false, reason: 'invalid_value:type' };
  }

  // Validate min_size_bytes if provided
  if (params.min_size_bytes !== undefined) {
    const size = parseInt(params.min_size_bytes, 10);
    if (isNaN(size) || size < 0 || String(size) !== params.min_size_bytes) {
      return { ok: false, reason: 'invalid_value:min_size_bytes' };
    }
  }

  return { ok: true };
}

function validateCommandExitParams(params: ParsedParams): ParamValidationResult {
  // Check required keys
  for (const key of COMMAND_EXIT_REQUIRED) {
    if (!(key in params)) {
      return { ok: false, reason: `missing_required_key:${key}` };
    }
  }

  // Check for unknown keys
  for (const key of Object.keys(params)) {
    if (!COMMAND_EXIT_KNOWN.has(key)) {
      return { ok: false, reason: `unknown_key:${key}` };
    }
  }

  // Validate expected_exit if provided
  if (params.expected_exit !== undefined) {
    const code = parseInt(params.expected_exit, 10);
    if (isNaN(code) || String(code) !== params.expected_exit) {
      return { ok: false, reason: 'invalid_value:expected_exit' };
    }
  }

  // Validate timeout_ms if provided
  if (params.timeout_ms !== undefined) {
    const timeout = parseInt(params.timeout_ms, 10);
    if (isNaN(timeout) || timeout <= 0 || String(timeout) !== params.timeout_ms) {
      return { ok: false, reason: 'invalid_value:timeout_ms' };
    }
  }

  return { ok: true };
}

function validateHttpEndpointParams(params: ParsedParams): ParamValidationResult {
  // Check required keys
  for (const key of HTTP_ENDPOINT_REQUIRED) {
    if (!(key in params)) {
      return { ok: false, reason: `missing_required_key:${key}` };
    }
  }

  // Check for unknown keys
  for (const key of Object.keys(params)) {
    if (!HTTP_ENDPOINT_KNOWN.has(key)) {
      return { ok: false, reason: `unknown_key:${key}` };
    }
  }

  // Validate URL scheme
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(params.url);
  } catch {
    return { ok: false, reason: 'invalid_url:parse_error' };
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return { ok: false, reason: `invalid_scheme:${parsedUrl.protocol.replace(':', '')}` };
  }

  // Validate method if provided
  if (params.method !== undefined) {
    const method = params.method.toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      return { ok: false, reason: `invalid_method:${params.method}` };
    }
  }

  // Validate expected_status if provided
  if (params.expected_status !== undefined) {
    const status = parseInt(params.expected_status, 10);
    if (isNaN(status) || status < 100 || status > 599 || String(status) !== params.expected_status) {
      return { ok: false, reason: 'invalid_value:expected_status' };
    }
  }

  // Validate timeout_ms if provided
  if (params.timeout_ms !== undefined) {
    const timeout = parseInt(params.timeout_ms, 10);
    if (isNaN(timeout) || timeout <= 0 || String(timeout) !== params.timeout_ms) {
      return { ok: false, reason: 'invalid_value:timeout_ms' };
    }
  }

  return { ok: true };
}

// ============================================================================
// Check Execution
// ============================================================================

interface CheckResult {
  status: CheckStatus;
  reason?: string;
  evidence?: CheckEvidence;
}

function executeFileExistsCheck(params: ParsedParams): CheckResult {
  const path = params.path;
  const expectedType = params.type as 'file' | 'directory' | undefined;
  const minSizeBytes = params.min_size_bytes !== undefined
    ? parseInt(params.min_size_bytes, 10)
    : undefined;

  let stats;
  try {
    stats = statSync(path);
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') {
      return {
        status: 'failed',
        reason: 'path_not_found',
        evidence: { exists: false },
      };
    }
    if (error.code === 'EACCES') {
      return {
        status: 'unknown',
        reason: 'permission_denied',
      };
    }
    return {
      status: 'unknown',
      reason: `filesystem_error:${error.code || 'unknown'}`,
    };
  }

  const actualType = stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : 'other';
  const actualSize = stats.isFile() ? stats.size : undefined;

  // Check type mismatch
  if (expectedType && actualType !== expectedType) {
    return {
      status: 'failed',
      reason: `type_mismatch:expected=${expectedType},actual=${actualType}`,
      evidence: { actual_type: actualType, actual_size_bytes: actualSize, exists: true },
    };
  }

  // Check size (only for files)
  if (minSizeBytes !== undefined && actualType === 'file' && actualSize !== undefined) {
    if (actualSize < minSizeBytes) {
      return {
        status: 'failed',
        reason: `size_below_minimum:expected=${minSizeBytes},actual=${actualSize}`,
        evidence: { actual_type: actualType, actual_size_bytes: actualSize, exists: true },
      };
    }
  }

  return {
    status: 'passed',
    evidence: { actual_type: actualType, actual_size_bytes: actualSize, exists: true },
  };
}

function executeCommandExitCheck(params: ParsedParams): Promise<CheckResult> {
  return new Promise((resolve) => {
    const cmd = params.cmd;
    const argsStr = params.args;
    const expectedExit = params.expected_exit !== undefined
      ? parseInt(params.expected_exit, 10)
      : 0;
    const timeoutMs = params.timeout_ms !== undefined
      ? parseInt(params.timeout_ms, 10)
      : 30000;

    // Split args by comma, filter empty
    const argsArray = argsStr ? argsStr.split(',').filter(a => a.length > 0) : [];

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let resolved = false;

    const finish = (result: CheckResult) => {
      if (!resolved) {
        resolved = true;
        resolve(result);
      }
    };

    let child;
    try {
      child = spawn(cmd, argsArray, { shell: false });
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'EACCES') {
        return finish({
          status: 'unknown',
          reason: 'permission_denied',
        });
      }
      return finish({
        status: 'unknown',
        reason: `spawn_error:${error.code || 'unknown'}`,
      });
    }

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    const maxOutput = 4096;

    child.stdout?.on('data', (data: Buffer) => {
      if (stdout.length < maxOutput) {
        stdout += data.toString().slice(0, maxOutput - stdout.length);
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      if (stderr.length < maxOutput) {
        stderr += data.toString().slice(0, maxOutput - stderr.length);
      }
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (err.code === 'ENOENT') {
        finish({
          status: 'failed',
          reason: 'command_not_found',
        });
      } else if (err.code === 'EACCES') {
        finish({
          status: 'unknown',
          reason: 'permission_denied',
        });
      } else {
        finish({
          status: 'unknown',
          reason: `spawn_error:${err.code || 'unknown'}`,
        });
      }
    });

    child.on('close', (code) => {
      clearTimeout(timer);

      if (timedOut) {
        return finish({
          status: 'unknown',
          reason: 'timeout_exceeded',
          evidence: { stdout_truncated: stdout, stderr_truncated: stderr },
        });
      }

      const actualExit = code ?? 1;

      if (actualExit !== expectedExit) {
        return finish({
          status: 'failed',
          reason: `exit_mismatch:expected=${expectedExit},actual=${actualExit}`,
          evidence: { actual_exit: actualExit, stdout_truncated: stdout, stderr_truncated: stderr },
        });
      }

      finish({
        status: 'passed',
        evidence: { actual_exit: actualExit, stdout_truncated: stdout, stderr_truncated: stderr },
      });
    });
  });
}

function executeHttpEndpointCheck(params: ParsedParams): Promise<CheckResult> {
  return new Promise((resolve) => {
    const urlStr = params.url;
    const method = (params.method || 'GET').toUpperCase() as 'GET' | 'HEAD';
    const expectedStatus = params.expected_status !== undefined
      ? parseInt(params.expected_status, 10)
      : 200;
    const timeoutMs = params.timeout_ms !== undefined
      ? parseInt(params.timeout_ms, 10)
      : 5000;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(urlStr);
    } catch {
      return resolve({
        status: 'unknown',
        reason: 'invalid_url:parse_error',
      });
    }

    const isHttps = parsedUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const options: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: method,
      timeout: timeoutMs,
    };

    let finished = false;
    const finish = (result: CheckResult) => {
      if (!finished) {
        finished = true;
        resolve(result);
      }
    };

    const req = httpModule.request(options, (res) => {
      // Consume response body to prevent memory leaks
      res.resume();

      const actualStatus = res.statusCode ?? 0;

      if (actualStatus !== expectedStatus) {
        finish({
          status: 'failed',
          reason: `status_mismatch:expected=${expectedStatus},actual=${actualStatus}`,
          evidence: { actual_status: actualStatus },
        });
      } else {
        finish({
          status: 'passed',
          evidence: { actual_status: actualStatus },
        });
      }
    });

    req.on('timeout', () => {
      req.destroy();
      finish({
        status: 'unknown',
        reason: 'timeout_exceeded',
      });
    });

    req.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ECONNREFUSED') {
        finish({
          status: 'failed',
          reason: 'connection_refused',
        });
      } else if (err.code === 'ENOTFOUND') {
        finish({
          status: 'unknown',
          reason: 'dns_failure',
        });
      } else if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
        finish({
          status: 'unknown',
          reason: 'timeout_exceeded',
        });
      } else if (err.code === 'ENETUNREACH' || err.code === 'EHOSTUNREACH') {
        finish({
          status: 'unknown',
          reason: `network_error:${err.code}`,
        });
      } else if (err.message?.includes('SSL') || err.message?.includes('TLS') || err.code?.startsWith('ERR_TLS')) {
        finish({
          status: 'unknown',
          reason: 'tls_error',
        });
      } else {
        finish({
          status: 'unknown',
          reason: `network_error:${err.code || 'unknown'}`,
        });
      }
    });

    req.end();
  });
}

// ============================================================================
// Deterministic JSON
// ============================================================================

function buildDeterministicReceipt(receipt: VerificationReceipt): string {
  // Sort checks by check_id
  const sortedChecks = [...receipt.checks].sort((a, b) =>
    a.check_id.localeCompare(b.check_id)
  );

  // Build each check with sorted keys
  const processedChecks = sortedChecks.map(check => {
    const result: Record<string, unknown> = {
      capability: check.capability,
      check_id: check.check_id,
    };

    if (check.evidence !== undefined) {
      // Sort evidence keys
      const sortedEvidence: Record<string, unknown> = {};
      for (const key of Object.keys(check.evidence).sort()) {
        if (check.evidence[key] !== undefined) {
          sortedEvidence[key] = check.evidence[key];
        }
      }
      result.evidence = sortedEvidence;
    }

    if (check.reason !== undefined) {
      result.reason = check.reason;
    }

    result.status = check.status;

    return result;
  });

  // Build receipt with sorted keys (alphabetical order)
  const sortedReceipt = {
    checks: processedChecks,
    receipt_type: receipt.receipt_type,
    receipt_version: receipt.receipt_version,
    spec_hash: receipt.spec_hash,
    spec_version: receipt.spec_version,
    state: receipt.state,
    system_id: receipt.system_id,
    validation_receipt_ref: receipt.validation_receipt_ref,
  };

  return JSON.stringify(sortedReceipt, null, 2);
}

// ============================================================================
// Main Verify Function
// ============================================================================

export async function verify(
  specPath: string,
  options: VerifyOptions
): Promise<VerifyResult> {
  const absoluteSpecPath = resolve(specPath);

  // Read spec
  let rawSpec: string;
  try {
    rawSpec = readFileSync(absoluteSpecPath, 'utf8');
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    process.stderr.write(`Error reading spec file: ${error.message}\n`);
    return { exitCode: 2, receiptPath: '' };
  }

  const specHash = hashFile(absoluteSpecPath);

  // Load and run parser
  let parseDil: (raw: string) => ParsedSpec;
  try {
    parseDil = await loadParser();
  } catch (err) {
    process.stderr.write(`Error loading parser: ${err}\n`);
    return { exitCode: 2, receiptPath: '' };
  }

  const parsedSpec = parseDil(rawSpec);

  // Extract predicates from raw text
  const predicates = extractValidationPredicates(rawSpec);

  // Find verification checks
  const verificationChecks: ValidationPredicate[] = [];

  for (const [validationId, validation] of parsedSpec.validations) {
    const capability = validation.requires_capability;

    if (!capability || !VERIFICATION_CAPABILITIES.has(capability)) {
      continue;
    }

    const predicateText = predicates.get(validationId);
    if (!predicateText) {
      continue;
    }

    // Verify predicate starts with the capability name
    const firstToken = predicateText.trim().split(/\s+/)[0];
    if (firstToken !== capability) {
      continue;
    }

    verificationChecks.push({
      validationId,
      capability,
      predicateText,
    });
  }

  // Apply filtering if specified
  let filteredChecks = verificationChecks;

  if (options.onlyCheckIds && options.onlyCheckIds.length > 0) {
    // Filter by exact IDs
    const idSet = new Set(options.onlyCheckIds);
    filteredChecks = verificationChecks.filter(vc => idSet.has(vc.validationId));
  } else if (options.onlyCheckPrefix && options.onlyCheckPrefix.length > 0) {
    // Filter by prefix
    filteredChecks = verificationChecks.filter(vc =>
      options.onlyCheckPrefix!.some(prefix => vc.validationId.startsWith(prefix))
    );
  }

  // Execute checks
  const checks: Check[] = [];

  for (const vc of filteredChecks) {
    const checkId = `validations.${vc.validationId}`;

    // Parse params
    const parseResult = parsePredicateParams(vc.predicateText, vc.capability);

    if (!parseResult.ok) {
      checks.push({
        capability: vc.capability,
        check_id: checkId,
        reason: parseResult.reason,
        status: 'unknown',
      });
      continue;
    }

    const params = parseResult.params;

    // Validate params
    let validationResult: ParamValidationResult;

    switch (vc.capability) {
      case 'check_file_exists':
        validationResult = validateFileExistsParams(params);
        break;
      case 'check_command_exit':
        validationResult = validateCommandExitParams(params);
        break;
      case 'check_http_endpoint':
        validationResult = validateHttpEndpointParams(params);
        break;
      default:
        validationResult = { ok: false, reason: `unsupported_capability:${vc.capability}` };
    }

    if (!validationResult.ok) {
      checks.push({
        capability: vc.capability,
        check_id: checkId,
        reason: validationResult.reason,
        status: 'unknown',
      });
      continue;
    }

    // Execute check
    let result: CheckResult;

    switch (vc.capability) {
      case 'check_file_exists':
        result = executeFileExistsCheck(params);
        break;
      case 'check_command_exit':
        result = await executeCommandExitCheck(params);
        break;
      case 'check_http_endpoint':
        result = await executeHttpEndpointCheck(params);
        break;
      default:
        result = { status: 'unknown', reason: `unsupported_capability:${vc.capability}` };
    }

    const check: Check = {
      capability: vc.capability,
      check_id: checkId,
      status: result.status,
    };

    if (result.evidence) {
      check.evidence = result.evidence;
    }

    if (result.reason) {
      check.reason = result.reason;
    }

    checks.push(check);
  }

  // Aggregate state
  let state: 'verified' | 'unverified' | 'unknown';
  let exitCode: number;

  if (checks.some(c => c.status === 'failed')) {
    state = 'unverified';
    exitCode = 1;
  } else if (checks.some(c => c.status === 'unknown')) {
    state = 'unknown';
    exitCode = 2;
  } else {
    state = 'verified';
    exitCode = 0;
  }

  // Determine validation receipt ref
  const validationReceiptPath = resolve(RECEIPTS_DIR, `${specHash}.validation.json`);
  const validationReceiptRef = existsSync(validationReceiptPath)
    ? validationReceiptPath
    : 'missing';

  // Build receipt
  const receipt: VerificationReceipt = {
    checks,
    receipt_type: 'verification',
    receipt_version: 'DIL:verify v0',
    spec_hash: specHash,
    spec_version: parsedSpec.spec_version,
    state,
    system_id: parsedSpec.system_id,
    validation_receipt_ref: validationReceiptRef,
  };

  // Determine output path
  let receiptPath: string;
  if (options.out) {
    receiptPath = resolve(options.out);
  } else {
    receiptPath = resolve(VERIFICATION_DIR, `${specHash}.verification.json`);
  }

  // Write receipt
  const receiptJson = buildDeterministicReceipt(receipt);
  writeFile(receiptPath, receiptJson);

  return { exitCode, receiptPath };
}
