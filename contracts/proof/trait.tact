import "../messages";

trait Proof {
    abstract fun verifyClaim(msg: ClaimDrop): Bool;
}