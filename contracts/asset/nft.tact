// https://github.com/ton-blockchain/TEPs/blob/master/text/0062-nft-standard.md
import "../messages";

message(0x5fcc3d14) NftTransfer {
    queryId: Int as uint64;
    newOwner: Address;
    responseDestination: Address;
    customPayload: Cell?;
    forwardAmount: Int as coins;
    forwardPayload: Slice as remaining;
}

trait NFT {
    fun sendAsset(msg: ClaimDrop) {
        let _ = NftTransfer{
            queryId: msg.claimId,
            newOwner: msg.recipient,
            responseDestination: myAddress(),
            customPayload: null,
            forwardAmount: 0,
            forwardPayload: emptySlice()
        };
        send(SendParameters{
            to: msg.recipient,
            value: msg.amount,
            mode: SendPayGasSeparately
        });
    }
}