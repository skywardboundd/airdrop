// Marker-based double-claim protection: one contract per claim.
trait MarkerDoubleClaim {
    fun isClaimed(claimId: Int): Bool {
        let expectedMarker = contractAddress(initOf Marker(claimId, myAddress(), false));
        if (sender() != expectedMarker) {
            return true;
        }
        return false;
    }

    fun markClaimed(claimId: Int) {
        let _ = claimId;
        // Claim state is stored in the marker contract.
    }
}

contract Marker (claimId: Int as uint64, airdrop: Address, claimed: Bool) {
    receive(msg: ClaimDrop) {
        throwUnless(101, msg.claimId == self.claimId);
        throwUnless(103, sender() == msg.recipient);

        throwUnless(102, self.claimed == false);
        self.claimed = true;

        send(SendParameters{
            to: self.airdrop,
            value: 0,
            mode: SendPayGasSeparately,
            body: msg.toCell()
        });
    }
}