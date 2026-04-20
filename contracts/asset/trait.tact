import "../messages";

trait Asset {
    abstract fun sendAsset(msg: ClaimDrop);

    fun sendCoins(to: Address, amount: Int) {
        send(SendParameters{
            to: to,
            value: amount,
            mode: SendPayGasSeparately
        });
    }
}