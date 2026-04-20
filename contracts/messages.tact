message ClaimDrop {
    claimId: Int as uint64;
    recipient: Address;
    amount: Int as coins;
    proof: Cell;
}

message UpdateMerkleRoot {
    root: Int as uint256;
}

message RegisterNftForClaim {
    claimId: Int as uint64;
    nftItem: Address;
}

message UpdateDistributionEntry {
    user: Address;
    amount: Int as coins;
}
