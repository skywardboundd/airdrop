import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const proofs = ['merkle', 'signing', 'particia'] as const;
const assets = ['jetton', 'nft'] as const;
const doubleClaims = ['map', 'markers'] as const;

type ComboResult = {
  combo: string;
  ok: boolean;
  logFile: string;
};

function runCommand(
  cmd: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {}
): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let output = '';
    child.stdout.on('data', (d) => (output += d.toString()));
    child.stderr.on('data', (d) => (output += d.toString()));
    child.on('close', (code) => resolve({ code: code ?? 1, output }));
  });
}

async function main() {
  const root = PROJECT_ROOT;
  const outGenerated = join(root, 'build', 'generated');
  const outBuild = join(root, 'build', 'matrix');
  const outLogs = join(root, 'build', 'matrix-logs');

  await rm(outBuild, { recursive: true, force: true });
  await rm(outLogs, { recursive: true, force: true });
  await mkdir(outGenerated, { recursive: true });
  await mkdir(outBuild, { recursive: true });
  await mkdir(outLogs, { recursive: true });

  const results: ComboResult[] = [];

  for (const proof of proofs) {
    for (const asset of assets) {
      for (const dc of doubleClaims) {
        const combo = `${proof}.${asset}.${dc}`;
        const logFile = join(outLogs, `${combo}.log`);
        const buildDir = join(outBuild, combo);
        console.log(`==> ${combo}`);

        const gen = await runCommand(
          'npm',
          ['run', '-s', 'build:airdrop-temp'],
          root,
          {
            AIRDROP_PROOF: proof,
            AIRDROP_ASSET: asset,
            AIRDROP_DOUBLE_CLAIM: dc
          }
        );

        let ok = gen.code === 0;
        let output = gen.output;

        if (ok) {
          const compile = await runCommand('tact', ['contracts/airdrop.generated.tact', '-o', buildDir], root);
          ok = compile.code === 0;
          output += `\n${compile.output}`;
        }

        if (ok) {
          await cp(
            join(root, 'contracts', 'airdrop.generated.tact'),
            join(outGenerated, `airdrop.${combo}.tact`)
          );
          console.log('   COMPILE_OK');
        } else {
          console.log('   COMPILE_FAIL');
        }

        await writeFile(logFile, output, 'utf8');
        results.push({ combo, ok, logFile });
      }
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;
  console.log(`TOTAL_COMPILE_OK=${okCount} TOTAL_COMPILE_FAIL=${failCount}`);

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
