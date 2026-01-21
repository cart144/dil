import { resolve } from 'node:path';
import { validate } from './validate.js';
import { hashFile, writeFile, generateRunId, spawnPassthrough, ensureDir } from '../utils.js';

const DIL_ROOT = '/var/lib/dil';
const RUNS_DIR = resolve(DIL_ROOT, '.dil/runs');

export interface RunResult {
  exitCode: number;
  runId?: string;
}

export async function run(
  specPath: string,
  command: string[]
): Promise<RunResult> {
  const absoluteSpecPath = resolve(specPath);

  // First validate
  const validateResult = await validate(absoluteSpecPath, {});

  // Print receipt path from validation
  console.log(validateResult.receiptPath);

  // If validation failed, do not execute command
  if (validateResult.exitCode !== 0) {
    return { exitCode: validateResult.exitCode };
  }

  // Generate run ID
  const specHash = hashFile(absoluteSpecPath);
  const runId = generateRunId(specHash);
  const runDir = resolve(RUNS_DIR, runId);

  // Ensure run directory exists
  ensureDir(runDir);

  // Write receipt path reference
  writeFile(resolve(runDir, 'receipt.path'), validateResult.receiptPath);

  // Execute command with environment variables
  const env = {
    ...process.env,
    DIL_SPEC_PATH: absoluteSpecPath,
    DIL_RECEIPT_PATH: validateResult.receiptPath,
  };

  const [cmd, ...args] = command;
  const result = await spawnPassthrough(cmd, args, { env });

  // Write logs
  writeFile(resolve(runDir, 'executor.stdout.log'), result.stdout);
  writeFile(resolve(runDir, 'executor.stderr.log'), result.stderr);

  return {
    exitCode: result.exitCode,
    runId,
  };
}
