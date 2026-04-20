import "./trait";

// On-chain distribution map verification.
trait PatriciaProof {
    distribution: map<Address, Int as coins>;

    fun verifyClaim(msg: ClaimDrop): Bool {
        if (msg.amount <= 0) {
            return false;
        }
        if (sender() != msg.recipient) {
            return false;
        }
        
        return self.distribution.get(msg.recipient) == msg.amount;  
    }
}