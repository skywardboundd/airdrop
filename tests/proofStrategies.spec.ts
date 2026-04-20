import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildProof, claimLeaf, merkleRoot, type Claim } from '../src/merkle';
import { verifyMerkle, verifyPatriciaLike, verifySignatureLike } from '../src/proofStrategies';

const claim: Claim = { claimId: 1n, recipient: 'alice', amount: 500n };

describe('Proof strategies', () => {
  it('merkle strategy: valid/invalid', () => {
    const claims = [claim, { claimId: 2n, recipient: 'bob', amount: 700n }];
    const leaves = claims.map(claimLeaf);
    const root = merkleRoot(leaves);
    const proof = buildProof(0, leaves);
    expect(verifyMerkle(claim, proof, root)).toBe(true);
    expect(verifyMerkle({ ...claim, amount: 501n }, proof, root)).toBe(false);
  });

  it('signature-like strategy: valid/invalid', () => {
    const key = 'backend-public-key-hint';
    const payload = `${claim.claimId}:${claim.recipient}:${claim.amount}`;
    const sig = createHmac('sha256', key).update(payload).digest();
    expect(verifySignatureLike(claim, sig, key)).toBe(true);
    expect(verifySignatureLike(claim, Buffer.alloc(32, 1), key)).toBe(false);
  });

  it('patricia-like strategy: valid/invalid', () => {
    const prefix = 'users/';
    const expected = createHash('sha256')
      .update(prefix)
      .update(`${claim.claimId}:${claim.recipient}:${claim.amount}`)
      .digest();
    expect(verifyPatriciaLike(claim, prefix, expected)).toBe(true);
    expect(verifyPatriciaLike(claim, prefix, Buffer.alloc(32, 0x12))).toBe(false);
  });
});
