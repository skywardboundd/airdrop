import { Bench } from 'tinybench';
import { createHash, createHmac } from 'node:crypto';
import { buildProof, claimLeaf, merkleRoot, type Claim } from '../src/merkle';
import { verifyMerkle, verifyPatriciaLike, verifySignatureLike } from '../src/proofStrategies';
import type { BenchRow } from './types';

function mkClaim(i: number): Claim {
  return {
    claimId: BigInt(i),
    recipient: `user-${i}`,
    amount: BigInt(1000 + i)
  };
}

export async function runProofBench(): Promise<BenchRow[]> {
  const sizes = [1_000, 10_000, 100_000, 1_000_000];
  const rows: BenchRow[] = [];

  console.log('\n=== Proof traits benchmark ===');
  for (const size of sizes) {
    const claims = Array.from({ length: size }, (_, i) => mkClaim(i));
    const leaves = claims.map(claimLeaf);
    const root = merkleRoot(leaves);
    const target = Math.floor(size / 3);
    const claim = claims[target];
    const proof = buildProof(target, leaves);

    const key = 'backend-public-key-hint';
    const payload = `${claim.claimId}:${claim.recipient}:${claim.amount}`;
    const sig = createHmac('sha256', key).update(payload).digest();

    const prefix = 'users/';
    const valueHash = createHash('sha256')
      .update(prefix)
      .update(payload)
      .digest();

    const bench = new Bench({ time: 350 });
    bench
      .add('Proof/Merkle verify', () => {
        verifyMerkle(claim, proof, root);
      })
      .add('Proof/Signature-like verify', () => {
        verifySignatureLike(claim, sig, key);
      })
      .add('Proof/Patricia-like verify', () => {
        verifyPatriciaLike(claim, prefix, valueHash);
      });

    await bench.warmup();
    await bench.run();

    for (const task of bench.tasks) {
      const hz = task.result?.hz ?? 0;
      const p99ms = task.result?.p99 ?? 0;
      const avgms = hz > 0 ? 1000 / hz : 0;
      const variant = task.name.replace('Proof/', '');
      rows.push({ suite: 'Proof', variant, size, hz, p99ms, avgms });
      console.log(`${task.name} [N=${size}]: ${hz.toFixed(2)} ops/s; p99 ${p99ms.toFixed(4)} ms`);
    }
  }

  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runProofBench().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
