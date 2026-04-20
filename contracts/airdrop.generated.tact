import "./messages";
import "./proof/merkle";
import "./asset/jetton";
import "./double-claim/map";

// AUTO-GENERATED FILE. DO NOT EDIT MANUALLY.
// proof=merkle, asset=jetton, doubleClaim=map
contract Airdrop with MerkleProof, Jetton, MapDoubleClaim {
    owner: Address;
    merkleRoot: Int as uint256;
    publicKey: Int as uint256;
    jettonWallet: Address;
    distribution: map<Address, Int as coins>;
    claimBitmap: map<Int as uint64, Cell>;
    markerClaimed: map<Address, Bool>;
    nftByClaim: map<Int as uint64, Address>;

    init(
        owner: Address,
        merkleRoot: Int as uint256,
        publicKey: Int as uint256,
        jettonWallet: Address,
        distribution: map<Address, Int as coins>
    ) {
        self.owner = owner;
        self.merkleRoot = merkleRoot;
        self.publicKey = publicKey;
        self.jettonWallet = jettonWallet;
        self.distribution = distribution;
        self.claimBitmap = emptyMap();
        self.markerClaimed = emptyMap();
        self.nftByClaim = emptyMap();
    }

    receive(msg: ClaimDrop) {
        if (msg.amount <= 0) {
            return;
        }
        if (!self.verifyClaim(msg)) {
            return;
        }
        if (self.isClaimed(msg.claimId)) {
            return;
        }

        self.markClaimed(msg.claimId);
        self.sendAsset(msg);
    }

    receive(msg: UpdateMerkleRoot) {
        if (sender() != self.owner) {
            return;
        }
        self.merkleRoot = msg.root;
    }

    receive(msg: RegisterNftForClaim) {
        if (sender() != self.owner) {
            return;
        }
        self.nftByClaim.set(msg.claimId, msg.nftItem);
    }

    receive(msg: UpdateDistributionEntry) {
        if (sender() != self.owner) {
            return;
        }
        self.distribution.set(msg.user, msg.amount);
    }

    get fun claimed(claimId: Int): Bool {
        return self.isClaimed(claimId);
    }

    get fun merkleRootValue(): Int {
        return self.merkleRoot;
    }
}
