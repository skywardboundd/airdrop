// Chunked bitmap via LDSLICEX (same approach as highload-wallet-v3).
// Each cell stores 1023 flag bits.
// chunkIdx = claimId / 1023, bitIdx = claimId % 1023
// Capacity: ~43.7k cells × 1023 bits ≈ 44.7M claims.

struct SlicePair {
    rest: Slice;
    first: Slice;
}

asm(-> 1 0) fun splitAt(s: Slice, n: Int): SlicePair { LDSLICEX }

trait MapDoubleClaim {
    claimBitmap: map<Int as uint64, Cell>;

    fun emptyChunk(): Cell {
        return beginCell()
            .storeUint(0, 256)
            .storeUint(0, 256)
            .storeUint(0, 256)
            .storeUint(0, 255)
            .endCell();
    }

    fun isClaimed(claimId: Int): Bool {
        let chunkIdx: Int = claimId / 1023;
        let bitIdx: Int   = claimId % 1023;

        let chunk: Cell? = self.claimBitmap.get(chunkIdx);
        if (chunk == null) {
            return false;
        }

        let pair: SlicePair = splitAt((chunk!!).beginParse(), bitIdx);
        return pair.rest.loadBit();
    }

    fun markClaimed(claimId: Int) {
        let chunkIdx: Int = claimId / 1023;
        let bitIdx: Int   = claimId % 1023;

        let chunk: Cell? = self.claimBitmap.get(chunkIdx);
        let source: Cell = (chunk != null) ? chunk!! : self.emptyChunk();

        let pair: SlicePair = splitAt(source.beginParse(), bitIdx);
        let tail: Slice = pair.rest;
        tail.loadBit();

        self.claimBitmap.set(chunkIdx,
            beginCell()
                .storeSlice(pair.first)
                .storeBit(true)
                .storeSlice(tail)
                .endCell()
        );
    }
}
