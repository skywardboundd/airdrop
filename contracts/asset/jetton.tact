// https://github.com/ton-blockchain/TEPs/blob/master/text/0074-jettons-standard.md
import "../messages";

message(0xf8a7ea5) JettonTransfer {
    queryId: Int as uint64;
    amount: Int as coins;
    destination: Address;
    responseDestination: Address;
    customPayload: Cell?;
    forwardTonAmount: Int as coins;
    forwardPayload: Slice as remaining;
}

trait Jetton {
    fun sendAsset(msg: ClaimDrop) {
        let _ = JettonTransfer {
            queryId: msg.claimId,
            amount: msg.amount,
            destination: msg.recipient,
            responseDestination: myAddress(),
            customPayload: null,
            forwardTonAmount: 0,
            forwardPayload: emptySlice()
        };
        send(SendParameters{
            to: msg.recipient,
            value: msg.amount,
            mode: SendPayGasSeparately
        });
    }
}
