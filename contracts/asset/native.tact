// Native TON transfer asset.
import "../messages";

trait NativeTon {
    fun sendAsset(msg: ClaimDrop) {
        send(SendParameters{
            to: msg.recipient,
            value: msg.amount,
            mode: SendPayGasSeparately
        });
    }
}
