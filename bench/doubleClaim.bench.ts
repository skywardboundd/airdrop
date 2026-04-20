import { Bench } from 'tinybench';
import { MapDoubleClaimStore, MarkerDoubleClaimStore } from '../src/doubleClaim';
import type { BenchRow } from './types';

export async function runDoubleClaimBench(): Promise<BenchRow[]> {
  const sizes = [1_000, 10_000, 100_000, 1_000_000];
  const rows: BenchRow[] = [];

  console.log('\n=== Double-claim traits benchmark ===');
  for (const size of sizes) {
    const ids = Array.from({ length: size }, (_, i) => BigInt(i));
    const mapStore = new MapDoubleClaimStore();
    const markerStore = new MarkerDoubleClaimStore((id) => `sender-${id}`);

    for (const id of ids) {
      mapStore.markClaimed(id);
      markerStore.markClaimed(id);
    }

    let idx = 0;
    const bench = new Bench({ time: 350 });
    bench
      .add('DoubleClaim/Map isClaimed', () => {
        mapStore.isClaimed(ids[(idx++) % ids.length]);
      })
      .add('DoubleClaim/Marker isClaimed', () => {
        markerStore.isClaimed(ids[(idx++) % ids.length]);
      });

    await bench.warmup();
    await bench.run();

    for (const task of bench.tasks) {
      const hz = task.result?.hz ?? 0;
      const p99ms = task.result?.p99 ?? 0;
      const avgms = hz > 0 ? 1000 / hz : 0;
      const variant = task.name.replace('DoubleClaim/', '').replace(' isClaimed', '');
      rows.push({ suite: 'DoubleClaim', variant, size, hz, p99ms, avgms });
      console.log(`${task.name} [N=${size}]: ${hz.toFixed(2)} ops/s; p99 ${p99ms.toFixed(4)} ms`);
    }
  }

  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runDoubleClaimBench().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
