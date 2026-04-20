// Example custom asset: Soulbound Token (SBT).
// Usage: AIRDROP_ASSET=custom AIRDROP_ASSET_IMPORT=asset/sbt AIRDROP_ASSET_TRAIT=SbtAsset
import "../messages";

message(0x5fcc3d14) SbtMint {
    queryId: Int as uint64;
    newOwner: Address;
    responseDestination: Address;
    customPayload: Cell?;
    forwardAmount: Int as coins;
    forwardPayload: Slice as remaining;
}

trait SbtAsset {
    jettonWallet: Address; // reused as SBT collection address

    fun sendAsset(msg: ClaimDrop) {
        let body: Cell = SbtMint{
            queryId: msg.claimId,
            newOwner: msg.recipient,
            responseDestination: myAddress(),
            customPayload: null,
            forwardAmount: 0,
            forwardPayload: emptySlice()
        }.toCell();

        send(SendParameters{
            to: self.jettonWallet,
            value: msg.amount,
            mode: SendPayGasSeparately,
            body: body
        });
    }
}
