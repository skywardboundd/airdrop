import "./trait";

// Ed25519 signature-based claim verification.
trait SignatureProof {
    publicKey: Int as uint256;

    fun signingPayload(msg: ClaimDrop): Slice {
        return beginCell()
            .storeUint(msg.claimId, 64)
            .storeAddress(msg.recipient)
            .storeCoins(msg.amount)
            .endCell()
            .beginParse();
    }

    fun verifyClaim(msg: ClaimDrop): Bool {
        if (msg.amount <= 0) {
            return false;
        }

        // proof: first 512 bits = Ed25519 signature of payload.
        let signature = msg.proof.beginParse();
        let payload = self.signingPayload(msg);
        return checkDataSignature(payload, signature, self.publicKey);
    }
}