import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { spawn as nodeSpawn, SpawnOptions } from 'node:child_process';

export function hashFile(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

export function ensureDir(dirPath: string): void {
  mkdirSync(dirPath, { recursive: true });
}

export function ensureParentDir(filePath: string): void {
  ensureDir(dirname(filePath));
}

export function writeFile(filePath: string, content: string): void {
  ensureParentDir(filePath);
  writeFileSync(filePath, content, 'utf8');
}

export function generateRunId(specHash: string): string {
  const suffix = randomBytes(4).toString('hex');
  return `${specHash.slice(0, 16)}-${suffix}`;
}

export interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export function spawnProcess(
  command: string,
  args: string[],
  options?: SpawnOptions
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const child = nodeSpawn(command, args, {
      ...options,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });

    child.on('error', (err) => {
      stderr += err.message;
      resolve({
        exitCode: 1,
        stdout,
        stderr,
      });
    });
  });
}

export function spawnPassthrough(
  command: string,
  args: string[],
  options?: SpawnOptions
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = nodeSpawn(command, args, {
      ...options,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });

    child.on('error', (err) => {
      stderr += err.message;
      resolve({
        exitCode: 1,
        stdout,
        stderr,
      });
    });
  });
}
