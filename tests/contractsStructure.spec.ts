import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'contracts');

async function readContract(rel: string): Promise<string> {
  return readFile(join(root, rel), 'utf8');
}

describe('Contract structure checks', () => {
  it('SignatureProof uses real signature verification', async () => {
    const src = await readContract('proof/signing.tact');
    expect(src).toContain('checkDataSignature(');
    expect(src).toContain('publicKey: Int as uint256;');
    expect(src).toContain('fun signingPayload(msg: ClaimDrop): Slice');
  });

  it('MerkleProof uses asm exotic parsing and dict lookup', async () => {
    const src = await readContract('proof/merkle.tact');
    expect(src).toContain('XCTOS');
    expect(src).toContain('DICTUGET');
    expect(src).toContain('asmUdictGet(dict, 256, msg.claimId)');
  });

  it('Markers strategy verifies expected marker for claimId', async () => {
    const src = await readContract('double-claim/markers.tact');
    expect(src).toContain('contract Marker');
    expect(src).toContain('contractAddress(initOf Marker(claimId, myAddress(), false))');
    expect(src).toContain('msg.claimId == self.claimId');
  });
});
