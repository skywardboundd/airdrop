import { createHash } from 'node:crypto';

export type Claim = {
  claimId: bigint;
  recipient: string;
  amount: bigint;
};

export type ProofStep = {
  isRightSibling: boolean;
  siblingHash: Buffer;
};

function sha256(data: Buffer): Buffer {
  return createHash('sha256').update(data).digest();
}

function u64be(v: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(v);
  return b;
}

function u128be(v: bigint): Buffer {
  const b = Buffer.alloc(16);
  const hi = v >> 64n;
  const lo = v & ((1n << 64n) - 1n);
  b.writeBigUInt64BE(hi, 0);
  b.writeBigUInt64BE(lo, 8);
  return b;
}

export function claimLeaf(claim: Claim): Buffer {
  const recipient = Buffer.from(claim.recipient, 'utf8');
  return sha256(Buffer.concat([u64be(claim.claimId), recipient, u128be(claim.amount)]));
}

export function foldHash(left: Buffer, right: Buffer): Buffer {
  return sha256(Buffer.concat([left, right]));
}

export function buildMerkleTree(leaves: Buffer[]): Buffer[][] {
  if (leaves.length === 0) {
    return [[Buffer.alloc(32)]];
  }
  const levels: Buffer[][] = [leaves];
  while (levels[levels.length - 1].length > 1) {
    const prev = levels[levels.length - 1];
    const next: Buffer[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      const left = prev[i];
      const right = prev[i + 1] ?? prev[i];
      next.push(foldHash(left, right));
    }
    levels.push(next);
  }
  return levels;
}

export function merkleRoot(leaves: Buffer[]): Buffer {
  const tree = buildMerkleTree(leaves);
  return tree[tree.length - 1][0];
}

export function buildProof(index: number, leaves: Buffer[]): ProofStep[] {
  const tree = buildMerkleTree(leaves);
  const proof: ProofStep[] = [];
  let idx = index;

  for (let level = 0; level < tree.length - 1; level++) {
    const nodes = tree[level];
    const siblingIndex = idx ^ 1;
    const sibling = nodes[siblingIndex] ?? nodes[idx];
    const isRightSibling = siblingIndex > idx;
    proof.push({ isRightSibling, siblingHash: sibling });
    idx = Math.floor(idx / 2);
  }

  return proof;
}

export function verifyMerkleProof(leaf: Buffer, proof: ProofStep[], root: Buffer): boolean {
  let acc = leaf;
  for (const step of proof) {
    acc = step.isRightSibling ? foldHash(acc, step.siblingHash) : foldHash(step.siblingHash, acc);
  }
  return acc.equals(root);
}
