import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export type Variant = {
  proof: 'merkle' | 'signing' | 'particia';
  asset: 'jetton' | 'nft' | 'native_ton';
  dc: 'map' | 'markers';
};

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

export async function compileAndLoadWrapper(variant: Variant): Promise<any> {
  execFileSync('npm', ['run', '-s', 'build:airdrop-temp'], {
    cwd,
    env: {
      ...process.env,
      AIRDROP_PROOF: variant.proof,
      AIRDROP_ASSET: variant.asset,
      AIRDROP_DOUBLE_CLAIM: variant.dc
    },
    stdio: 'pipe'
  });

  const combo = `${variant.proof}.${variant.asset}.${variant.dc}`;
  const outDir = join(cwd, 'build/sandbox', combo);
  execFileSync('tact', ['contracts/airdrop.generated.tact', '-o', outDir], { cwd, stdio: 'pipe' });

  const files = walk(cwd);
  const wrapper = files.find(
    (f) => f.includes(`build/sandbox/${combo}`) && f.endsWith('_Airdrop.ts')
  );
  if (!wrapper) throw new Error(`Airdrop wrapper not found in ${outDir}`);

  const mod = await import(pathToFileURL(resolve(wrapper)).href);
  return mod.Airdrop;
}

export async function compileAndLoadWrappers(variant: Variant): Promise<{ Airdrop: any; Marker?: any }> {
  execFileSync('npm', ['run', '-s', 'build:airdrop-temp'], {
    cwd,
    env: {
      ...process.env,
      AIRDROP_PROOF: variant.proof,
      AIRDROP_ASSET: variant.asset,
      AIRDROP_DOUBLE_CLAIM: variant.dc
    },
    stdio: 'pipe'
  });

  const combo = `${variant.proof}.${variant.asset}.${variant.dc}`;
  const outDir = join(cwd, 'build/sandbox', combo);
  execFileSync('tact', ['contracts/airdrop.generated.tact', '-o', outDir], { cwd, stdio: 'pipe' });

  const files = walk(cwd).filter((f) => f.includes(`build/sandbox/${combo}`));
  const airdropPath = files.find((f) => f.endsWith('_Airdrop.ts'));
  if (!airdropPath) throw new Error(`Airdrop wrapper not found in ${outDir}`);

  const airdropMod = await import(pathToFileURL(resolve(airdropPath)).href);
  const markerPath = files.find((f) => f.endsWith('_Marker.ts'));
  if (!markerPath) return { Airdrop: airdropMod.Airdrop };

  const markerMod = await import(pathToFileURL(resolve(markerPath)).href);
  return { Airdrop: airdropMod.Airdrop, Marker: markerMod.Marker };
}
