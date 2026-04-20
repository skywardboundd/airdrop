import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generatedPath = join(cwd, 'contracts', 'airdrop.generated.tact');

function runGenerator(env: Record<string, string>) {
  execFileSync('npm', ['run', '-s', 'build:airdrop-temp'], {
    cwd,
    env: { ...process.env, ...env },
    stdio: 'pipe'
  });
  return readFileSync(generatedPath, 'utf8');
}

describe('Airdrop generator', () => {
  it('generates merkle+nft+markers combo with correct imports', () => {
    const src = runGenerator({
      AIRDROP_PROOF: 'merkle',
      AIRDROP_ASSET: 'nft',
      AIRDROP_DOUBLE_CLAIM: 'markers'
    });

    expect(src).toContain('import "./proof/merkle";');
    expect(src).toContain('import "./asset/nft";');
    expect(src).toContain('import "./double-claim/markers";');
    expect(src).toContain('contract Airdrop with MerkleProof, NFT, MarkerDoubleClaim');
  });

  it('generated contract has required fields and owner handlers', () => {
    const src = runGenerator({
      AIRDROP_PROOF: 'signing',
      AIRDROP_ASSET: 'jetton',
      AIRDROP_DOUBLE_CLAIM: 'map'
    });

    expect(src).toContain('publicKey: Int as uint256;');
    expect(src).toContain('receive(msg: UpdateDistributionEntry)');
    expect(src).not.toContain('receive(msg: RegisterMarker)');
  });
});
