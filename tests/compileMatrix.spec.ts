import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('Compile matrix integration', () => {
  it('compiles all combinations successfully', () => {
    const output = execFileSync('npm', ['run', '-s', 'compile:matrix'], {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe'
    });

    expect(output).toContain('TOTAL_COMPILE_OK=12');
    expect(output).toContain('TOTAL_COMPILE_FAIL=0');
  }, 30000);
});
