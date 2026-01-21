#!/usr/bin/env node

import { createRequire } from 'node:module';
import { validate } from './commands/validate.js';
import { run } from './commands/run.js';
import { verify } from './commands/verify.js';
import { agent } from './commands/agent.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

function printHelp(): void {
  process.stdout.write(`DIL - Decision & Intent Language

Usage:
  dil <command> [options]

Commands:
  agent <spec.dil> -- <cmd>    Execute spec with agent orchestration
  validate <spec.dil>          Validate a DIL specification
  verify <spec.dil>            Run verification checks

Options:
  --help, -h      Show help
  --version, -v   Show version

Exit Codes:
  0   COMPLETED
  1   FAILED
  2   UNKNOWN
`);
}

function printVersion(): void {
  process.stdout.write(`${pkg.version}\n`);
}

function printUsage(): void {
  process.stderr.write(`Usage:
  dil validate <specPath> [--out <receiptPath>]
  dil verify <specPath> [--out <path>] [--only-check-prefix <prefix>]... [--only-check-ids <id1,id2,...>]
  dil run <specPath> -- <command...>
  dil agent <specPath> -- <cmd> <args...>
`);
}

function parseValidateArgs(args: string[]): { specPath: string; out?: string } | null {
  if (args.length < 1) return null;

  const specPath = args[0];
  let out: string | undefined;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--out' && args[i + 1]) {
      out = args[i + 1];
      i++;
    }
  }

  return { specPath, out };
}

function parseVerifyArgs(args: string[]): {
  specPath: string;
  out?: string;
  onlyCheckPrefix?: string[];
  onlyCheckIds?: string[];
} | null {
  if (args.length < 1) return null;

  const specPath = args[0];
  let out: string | undefined;
  const onlyCheckPrefix: string[] = [];
  let onlyCheckIds: string[] | undefined;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--out' && args[i + 1]) {
      out = args[i + 1];
      i++;
    } else if (args[i] === '--only-check-prefix' && args[i + 1]) {
      onlyCheckPrefix.push(args[i + 1]);
      i++;
    } else if (args[i] === '--only-check-ids' && args[i + 1]) {
      onlyCheckIds = args[i + 1].split(',').map(s => s.trim()).filter(s => s.length > 0);
      i++;
    }
  }

  return {
    specPath,
    out,
    onlyCheckPrefix: onlyCheckPrefix.length > 0 ? onlyCheckPrefix : undefined,
    onlyCheckIds,
  };
}

function parseRunArgs(args: string[]): { specPath: string; command: string[] } | null {
  const dashDashIndex = args.indexOf('--');
  if (dashDashIndex === -1 || dashDashIndex === 0) return null;

  const specPath = args[0];
  const command = args.slice(dashDashIndex + 1);

  if (command.length === 0) return null;

  return { specPath, command };
}

function parseAgentArgs(args: string[]): { specPath: string; cmd: string; argv: string[] } | null {
  const dashDashIndex = args.indexOf('--');
  if (dashDashIndex === -1 || dashDashIndex === 0) return null;

  const specPath = args[0];
  const afterDash = args.slice(dashDashIndex + 1);

  if (afterDash.length === 0) return null;

  const cmd = afterDash[0];
  const argv = afterDash.slice(1);

  return { specPath, cmd, argv };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printHelp();
    process.exit(0);
  }

  const command = args[0];

  // Handle global flags
  if (command === '--help' || command === '-h') {
    printHelp();
    process.exit(0);
  }

  if (command === '--version' || command === '-v') {
    printVersion();
    process.exit(0);
  }

  const commandArgs = args.slice(1);

  switch (command) {
    case 'validate': {
      const parsed = parseValidateArgs(commandArgs);
      if (!parsed) {
        process.stderr.write('Error: validate requires <specPath>\n');
        printUsage();
        process.exit(1);
      }

      const result = await validate(parsed.specPath, { out: parsed.out });
      console.log(result.receiptPath);
      process.exit(result.exitCode);
      break;
    }

    case 'verify': {
      const parsed = parseVerifyArgs(commandArgs);
      if (!parsed) {
        process.stderr.write('Error: verify requires <specPath>\n');
        printUsage();
        process.exit(1);
      }

      const result = await verify(parsed.specPath, {
        out: parsed.out,
        onlyCheckPrefix: parsed.onlyCheckPrefix,
        onlyCheckIds: parsed.onlyCheckIds,
      });
      console.log(result.receiptPath);
      process.exit(result.exitCode);
      break;
    }

    case 'run': {
      const parsed = parseRunArgs(commandArgs);
      if (!parsed) {
        process.stderr.write('Error: run requires <specPath> -- <command...>\n');
        printUsage();
        process.exit(1);
      }

      const result = await run(parsed.specPath, parsed.command);
      process.exit(result.exitCode);
      break;
    }

    case 'agent': {
      const parsed = parseAgentArgs(commandArgs);
      if (!parsed) {
        process.stderr.write('Error: agent requires <specPath> -- <cmd> <args...>\n');
        printUsage();
        process.exit(1);
      }

      const result = await agent(parsed.specPath, parsed.cmd, parsed.argv);
      process.exit(result.exitCode);
      break;
    }

    default:
      process.stderr.write(`Error: unknown command "${command}"\n`);
      printUsage();
      process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
