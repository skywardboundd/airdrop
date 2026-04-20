import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BenchRow } from './types';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function toCsv(rows: BenchRow[]): string {
  const header = 'suite,variant,size,hz,p99ms,avgms';
  const lines = rows.map((r) =>
    [r.suite, r.variant, r.size, r.hz.toFixed(2), r.p99ms.toFixed(6), r.avgms.toFixed(6)].join(',')
  );
  return [header, ...lines].join('\n');
}

function score(row: BenchRow): number {
  // gas-like cost: higher latency = higher score
  return row.avgms * 1000;
}

function gasLikeMarkdown(rows: BenchRow[]): string {
  const bySuite = new Map<string, BenchRow[]>();
  for (const row of rows) {
    const arr = bySuite.get(row.suite) ?? [];
    arr.push(row);
    bySuite.set(row.suite, arr);
  }

  const lines: string[] = [];
  lines.push('# Gas-like Benchmark Report', '');
  lines.push('Metric: `gas_like_score = avg_ms * 1000` (lower is better).', '');

  for (const [suite, suiteRows] of bySuite) {
    lines.push(`## ${suite}`, '');
    lines.push('| variant | size | ops/s | avg ms | p99 ms | gas_like_score |');
    lines.push('|---|---:|---:|---:|---:|---:|');
    for (const row of suiteRows) {
      lines.push(
        `| ${row.variant} | ${row.size} | ${row.hz.toFixed(2)} | ${row.avgms.toFixed(6)} | ${row.p99ms.toFixed(6)} | ${score(row).toFixed(2)} |`
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}

export async function writeReports(rows: BenchRow[]): Promise<void> {
  const outDir = join(PROJECT_ROOT, 'build', 'bench-results');
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'results.json'), JSON.stringify(rows, null, 2), 'utf8');
  await writeFile(join(outDir, 'results.csv'), toCsv(rows), 'utf8');
  await writeFile(join(outDir, 'gas-like-report.md'), gasLikeMarkdown(rows), 'utf8');
}
