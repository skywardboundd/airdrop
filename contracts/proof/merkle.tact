import "./trait";

struct ExoticSlice {
    s: Slice;
    exotic: Int;
}

struct SliceInt {
    s: Slice;
    val: Int;
}

struct SliceCell {
    s: Slice;
    c: Cell;
}

struct DictGetResult {
    entry: Slice;
    found: Int;
}

asm(-> 1 0) fun beginParseExotic(c: Cell): ExoticSlice { XCTOS }
asm(-> 1 0) extends fun asmLoadUint(self: Slice, bits: Int): SliceInt { LDUX }
asm(-> 1 0) extends fun asmLoadRef(self: Slice): SliceCell { LDREF }
asm(-> 1 0) fun asmUdictGet(dict: Cell, keyLen: Int, key: Int): DictGetResult { DICTUGET }

// Merkle proof verification via exotic cell + dict lookup.
trait MerkleProof {
    merkleRoot: Int as uint256;

    fun claimLeaf(msg: ClaimDrop): Int {
        let leafCell = beginCell()
            .storeUint(msg.claimId, 64)
            .storeAddress(msg.recipient)
            .storeCoins(msg.amount)
            .endCell();
        return leafCell.hash();
    }

    fun foldHash(left: Int, right: Int): Int {
        let node = beginCell()
            .storeUint(left, 256)
            .storeUint(right, 256)
            .endCell();
        return node.hash();
    }

    fun verifyClaim(msg: ClaimDrop): Bool {
        if (msg.amount <= 0) {
            return false;
        }

        // exotic merkle proof: type=3, root:uint256, ref<dict>
        let parsed = beginParseExotic(msg.proof);
        if (parsed.exotic == 0) {
            return false;
        }

        let h1 = parsed.s.asmLoadUint(8);
        let s = h1.s;
        let proofType = h1.val;
        if (proofType != 3) {
            return false;
        }
        let h2 = s.asmLoadUint(256);
        s = h2.s;
        let rootFromProof = h2.val;
        if (rootFromProof != self.merkleRoot) {
            return false;
        }

        let dictPart = s.asmLoadRef();
        let dict = dictPart.c;

        let lookup = asmUdictGet(dict, 256, msg.claimId);
        if (lookup.found == 0) {
            return false;
        }

        let entry = lookup.entry;
        let entryRecipient = entry.loadAddress();
        let entryAmount = entry.loadCoins();
        if (entryRecipient != msg.recipient) {
            return false;
        }
        return entryAmount == msg.amount;
    }
}