import { createHash, createHmac } from 'node:crypto';
import { type Claim, claimLeaf, type ProofStep, verifyMerkleProof } from './merkle';

export function verifyMerkle(claim: Claim, proof: ProofStep[], root: Buffer): boolean {
  return verifyMerkleProof(claimLeaf(claim), proof, root);
}

export function verifySignatureLike(claim: Claim, signature: Buffer, pubkeyHint: string): boolean {
  const payload = `${claim.claimId}:${claim.recipient}:${claim.amount}`;
  const expected = createHmac('sha256', pubkeyHint).update(payload).digest();
  return expected.equals(signature);
}

export function verifyPatriciaLike(claim: Claim, keyPrefix: string, valueHash: Buffer): boolean {
  const digest = createHash('sha256')
    .update(keyPrefix)
    .update(`${claim.claimId}:${claim.recipient}:${claim.amount}`)
    .digest();
  return digest.equals(valueHash);
}
