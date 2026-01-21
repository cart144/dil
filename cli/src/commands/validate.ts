import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashFile, writeFile, spawnProcess } from '../utils.js';

// Resolve DIL_ROOT relative to executable location
// CLI is at cli/dist/commands/validate.js, root is ../../../
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DIL_ROOT = resolve(__dirname, '..', '..', '..');
const VALIDATOR_PATH = resolve(DIL_ROOT, 'validator/dist/index.js');
const RECEIPTS_DIR = resolve(DIL_ROOT, '.dil/receipts');

export interface ValidateOptions {
  out?: string;
}

export interface ValidateResult {
  exitCode: number;
  receiptPath: string;
}

export async function validate(
  specPath: string,
  options: ValidateOptions
): Promise<ValidateResult> {
  const absoluteSpecPath = resolve(specPath);

  // Run the validator
  const result = await spawnProcess('node', [VALIDATOR_PATH, absoluteSpecPath]);

  // Determine receipt path
  let receiptPath: string;
  if (options.out) {
    receiptPath = resolve(options.out);
  } else {
    const specHash = hashFile(absoluteSpecPath);
    receiptPath = resolve(RECEIPTS_DIR, `${specHash}.validation.json`);
  }

  // Write receipt
  writeFile(receiptPath, result.stdout);

  // Print errors to stderr if any
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  return {
    exitCode: result.exitCode,
    receiptPath,
  };
}
