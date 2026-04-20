import { describe, expect, it } from 'vitest';
import { MapDoubleClaimStore, MarkerDoubleClaimStore } from '../src/doubleClaim';

describe('Double-claim stores', () => {
  it('Map store blocks repeat claim', () => {
    const store = new MapDoubleClaimStore();
    const id = 42n;
    expect(store.isClaimed(id)).toBe(false);
    store.markClaimed(id);
    expect(store.isClaimed(id)).toBe(true);
  });

  it('Marker store blocks repeat claim for address', () => {
    const store = new MarkerDoubleClaimStore((claimId) => `sender-${claimId}`);
    const id = 5n;
    expect(store.isClaimed(id)).toBe(false);
    store.markClaimed(id);
    expect(store.isClaimed(id)).toBe(true);
  });
});
