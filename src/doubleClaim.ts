export interface DoubleClaimStore {
  isClaimed(claimId: bigint): boolean;
  markClaimed(claimId: bigint): void;
}

export class MapDoubleClaimStore implements DoubleClaimStore {
  private readonly bitmap = new Map<bigint, boolean>();

  isClaimed(claimId: bigint): boolean {
    return this.bitmap.get(claimId) === true;
  }

  markClaimed(claimId: bigint): void {
    this.bitmap.set(claimId, true);
  }
}

export class MarkerDoubleClaimStore implements DoubleClaimStore {
  private readonly markers = new Set<string>();

  constructor(private readonly senderByClaim: (claimId: bigint) => string) {}

  isClaimed(claimId: bigint): boolean {
    return this.markers.has(this.senderByClaim(claimId));
  }

  markClaimed(claimId: bigint): void {
    this.markers.add(this.senderByClaim(claimId));
  }
}
