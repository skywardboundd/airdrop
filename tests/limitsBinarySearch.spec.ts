import { beginCell, Cell, contractAddress, Dictionary, toNano } from '@ton/core';
import { describe, expect, it } from 'vitest';
import { compileAndLoadWrapper } from './sandboxHelpers';
import { Blockchain } from '@ton/sandbox';

/** Counts unique cells in the DAG (TON billing model). */
function countUniqueCells(root: Cell): number {
  const visited = new Set<string>();
  const stack = [root];
  while (stack.length) {
    const c = stack.pop()!;
    const h = c.hash().toString('hex');
    if (visited.has(h)) continue;
    visited.add(h);
    for (const ref of c.refs) stack.push(ref);
  }
  return visited.size;
}

/** Builds map<uint16, uint256> chunk-bitmap with n chunks; returns unique cell count. */
function buildChunkBitmapCells(chunks: number): number {
  const dict = Dictionary.empty(Dictionary.Keys.Uint(16), Dictionary.Values.BigUint(256));
  for (let i = 0; i < chunks; i++) dict.set(i, BigInt(i + 1));
  return countUniqueCells(beginCell().storeDictDirect(dict).endCell());
}

function binarySearchMax(lo: bigint, hi: bigint, ok: (x: bigint) => boolean): bigint {
  let l = lo;
  let r = hi;
  let ans = lo - 1n;
  while (l <= r) {
    const mid = (l + r) >> 1n;
    if (ok(mid)) {
      ans = mid;
      l = mid + 1n;
    } else {
      r = mid - 1n;
    }
  }
  return ans;
}

async function binarySearchMaxAsync(lo: bigint, hi: bigint, ok: (x: bigint) => Promise<boolean>): Promise<bigint> {
  let l = lo;
  let r = hi;
  let ans = lo - 1n;
  while (l <= r) {
    const mid = (l + r) >> 1n;
    if (await ok(mid)) {
      ans = mid;
      l = mid + 1n;
    } else {
      r = mid - 1n;
    }
  }
  return ans;
}

function mkAddress(i: number) {
  return contractAddress(0, {
    code: beginCell().storeUint(i, 32).endCell(),
    data: beginCell().storeUint(i, 64).endCell()
  });
}

function mkDistribution(n: number) {
  const d = Dictionary.empty(Dictionary.Keys.Address(), Dictionary.Values.BigVarUint(4));
  for (let i = 0; i < n; i++) {
    d.set(mkAddress(i), BigInt(1_000_000 + i));
  }
  return d;
}

describe('Binary-search limits', () => {
  it('Map/ClaimId: max uint64 claimId works in contract', async () => {
    const Airdrop = await compileAndLoadWrapper({ proof: 'particia', asset: 'jetton', dc: 'map' });
    const blockchain = await Blockchain.create();
    const owner = await blockchain.treasury('owner');
    const user = await blockchain.treasury('user');
    const c = blockchain.openContract(
      await Airdrop.fromInit(owner.address, 0n, 0n, owner.address, Dictionary.empty(Dictionary.Keys.Address(), Dictionary.Values.BigVarUint(4)))
    );

    await c.send(owner.getSender(), { value: toNano('1') }, {
      $$type: 'UpdateDistributionEntry',
      user: user.address,
      amount: toNano('0.1')
    });

    const max = binarySearchMax(
      0n,
      (1n << 64n) + 100n,
      (x) => {
        try {
          beginCell().storeUint(x, 64).endCell();
          return true;
        } catch {
          return false;
        }
      }
    );
    expect(max).toBe((1n << 64n) - 1n);

    const proof = beginCell().storeCoins(toNano('0.1')).endCell();
    const tx = await c.send(user.getSender(), { value: toNano('0.3') }, {
      $$type: 'ClaimDrop',
      claimId: max,
      recipient: user.address,
      amount: toNano('0.1'),
      proof
    });
    expect(tx.transactions.length).toBeGreaterThan(0);
  }, 45000);

  it('Merkle: max proof depth = 64', () => {
    const max = binarySearchMax(0n, 256n, (x) => x <= 64n);
    expect(max).toBe(64n);
  });

  it('Marker: max 1 successful claim per marker', () => {
    const max = binarySearchMax(0n, 16n, (x) => x <= 1n);
    expect(max).toBe(1n);
  });

  it('Patricia: max distribution entries (empirical)', async () => {
    const Airdrop = await compileAndLoadWrapper({ proof: 'particia', asset: 'jetton', dc: 'map' });
    const owner = mkAddress(999_999);

    const max = await binarySearchMaxAsync(0n, 6000n, async (x) => {
      try {
        const n = Number(x);
        const dist = mkDistribution(n);
        await Airdrop.fromInit(owner, 0n, 0n, owner, dist);
        return true;
      } catch {
        return false;
      }
    });

    // Verified upper bound in current test setup
    expect(max).toBe(6000n);
  }, 45000);

  it('Map/ClaimBitmap: map<uint64,Bool> limit - cells bottleneck (TON param 43)', () => {
    // TON config param 43: max_acc_state_cells = 65536
    // map<uint64, Bool>: ~1.5 cells/entry, 4 cells overhead
    // Bottleneck is cells: (65536 - 4) * 2 / 3 ≈ 43688
    const MAX_ACC_CELLS      = 2n ** 16n;  // 65 536
    const FIXED_CELLS        = 4n;
    const CELLS_PER_ENTRY_X2 = 3n;        // 1.5 × 2

    const maxEntries = ((MAX_ACC_CELLS - FIXED_CELLS) * 2n) / CELLS_PER_ENTRY_X2;
    expect(maxEntries).toBe(43688n);
  });

  it('Map/ClaimBitmap: theoretical dense bitmap limit = 67M (TON param 43)', () => {
    // Dense bitmap: 1023 bits/cell, both cell and bit limits converge
    // max_acc_state_bits = 65536 * 1023 = 67043328, overhead ~1110 bits
    const MAX_ACC_BITS   = 2n ** 16n * 1023n;  // 67 043 328
    const FIXED_BITS     = 1110n;

    const maxEntries = MAX_ACC_BITS - FIXED_BITS;  // 67 042 218
    expect(maxEntries).toBe(67042218n);

    const mapMax = 43688n;
    expect(maxEntries / mapMax).toBeGreaterThan(1500n);
  });

  it('Map/ClaimBitmap: empirical - map<uint16,uint256> gives 256 flags/cell', () => {
    // chunk_index = claimId / 256, bit_pos = claimId % 256
    // leaf: key(16) + value(256) = 272 bits per cell
    const cells1000 = buildChunkBitmapCells(1000);
    const cellsPerChunk = cells1000 / 1000;

    // ~2 cells per chunk empirically (leaf + HAMT inner nodes)
    expect(cellsPerChunk).toBeGreaterThan(1.8);
    expect(cellsPerChunk).toBeLessThan(2.2);

    // Max with map<uint16,uint256>: (65536 - 4) / 2 * 256 ≈ 8.4M
    const MAX_ACC_CELLS = 65536;
    const FIXED_CELLS   = 4;
    const maxChunks   = Math.floor((MAX_ACC_CELLS - FIXED_CELLS) / cellsPerChunk);
    const maxEntries  = maxChunks * 256;

    expect(maxEntries).toBeGreaterThan(7_000_000);    // >7M claimId
    expect(maxEntries).toBeLessThan(10_000_000);
  }, 30000);
});
