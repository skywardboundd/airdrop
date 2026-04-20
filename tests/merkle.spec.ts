import { describe, expect, it } from 'vitest';
import { buildProof, claimLeaf, merkleRoot, type Claim, verifyMerkleProof } from '../src/merkle';

function mkClaim(i: number): Claim {
  return {
    claimId: BigInt(i),
    recipient: `user-${i}`,
    amount: BigInt(1000 + i)
  };
}

describe('Merkle proof', () => {
  it('valid proof passes', () => {
    const claims = Array.from({ length: 16 }, (_, i) => mkClaim(i));
    const leaves = claims.map(claimLeaf);
    const root = merkleRoot(leaves);
    const target = 7;
    const proof = buildProof(target, leaves);
    const ok = verifyMerkleProof(claimLeaf(claims[target]), proof, root);
    expect(ok).toBe(true);
  });

  it('tampered amount breaks proof', () => {
    const claims = Array.from({ length: 8 }, (_, i) => mkClaim(i));
    const leaves = claims.map(claimLeaf);
    const root = merkleRoot(leaves);
    const target = 3;
    const proof = buildProof(target, leaves);
    const tampered = { ...claims[target], amount: claims[target].amount + 1n };
    const ok = verifyMerkleProof(claimLeaf(tampered), proof, root);
    expect(ok).toBe(false);
  });

  it('tampered sibling hash breaks proof', () => {
    const claims = Array.from({ length: 8 }, (_, i) => mkClaim(i));
    const leaves = claims.map(claimLeaf);
    const root = merkleRoot(leaves);
    const target = 2;
    const proof = buildProof(target, leaves);
    proof[0] = { ...proof[0], siblingHash: Buffer.alloc(32, 0xff) };
    const ok = verifyMerkleProof(claimLeaf(claims[target]), proof, root);
    expect(ok).toBe(false);
  });
});
