import { Address, Cell, Dictionary } from '@ton/core';

// -- Claim --

export type OnChainClaim = {
  readonly claimId: bigint;
  readonly recipient: Address;
  readonly amount: bigint;
};

// -- Proof modules (discriminated union) --

export type MerkleProofModule = {
  readonly kind: 'merkle';
  readonly claims: readonly OnChainClaim[];
};

export type SigningProofModule = {
  readonly kind: 'signing';
  /** 64-byte NaCl secret key (from keyPairFromSeed) */
  readonly secretKey: Buffer;
  /** 32-byte Ed25519 public key */
  readonly publicKey: Buffer;
};

export type PatriciaProofModule = {
  readonly kind: 'patricia';
};

export type ProofModule = MerkleProofModule | SigningProofModule | PatriciaProofModule;

export type ProofKind = ProofModule['kind'];

// -- Asset modules --

export type JettonAssetModule = {
  readonly kind: 'jetton';
  readonly jettonWallet: Address;
};

export type NftAssetModule = {
  readonly kind: 'nft';
};

export type NativeTonAssetModule = {
  readonly kind: 'native_ton';
};

/**
 * Custom asset module.
 * On-chain: user creates a .tact trait implementing `fun sendAsset(msg: ClaimDrop)`.
 * Off-chain: optional `buildSendBody` for client-side tx preview.
 */
export type CustomAssetModule = {
  readonly kind: 'custom';
  readonly tactTrait: string;
  readonly tactImport: string;
  readonly buildSendBody?: (claim: OnChainClaim) => Cell;
  readonly assetAddress?: Address;
};

export type AssetModule =
  | JettonAssetModule
  | NftAssetModule
  | NativeTonAssetModule
  | CustomAssetModule;

export type AssetKind = AssetModule['kind'];

// -- Double-claim modules --

export type MapDoubleClaimModule = { readonly kind: 'map' };

export type MarkerDoubleClaimModule = { readonly kind: 'markers' };

export type DoubleClaimModule = MapDoubleClaimModule | MarkerDoubleClaimModule;

export type DoubleClaimKind = DoubleClaimModule['kind'];

// -- Airdrop config (generic over proof) --

export type AirdropConfig<P extends ProofModule = ProofModule> = {
  readonly proof: P;
  readonly asset: AssetModule;
  readonly doubleClaim: DoubleClaimModule;
  readonly owner: Address;
};

// -- Variant key --

export type VariantKey = `${ProofKind}.${AssetKind}.${DoubleClaimKind}`;

// -- Claim params: depend on proof strategy --

export type ClaimParams<P extends ProofModule> =
  P extends MerkleProofModule
    ? { readonly claim: OnChainClaim }
    : P extends SigningProofModule
      ? { readonly claim: OnChainClaim }
      : P extends PatriciaProofModule
        ? { readonly claim: OnChainClaim }
        : never;

// -- Prepared transaction --

export type PreparedClaim = {
  readonly proofCell: Cell;
  readonly body: Cell;
};

// -- Contract init params (all fields always present; unused = default) --

export type ContractInitParams = {
  readonly owner: Address;
  readonly merkleRoot: bigint;
  readonly publicKey: bigint;
  readonly jettonWallet: Address;
  readonly distribution: Dictionary<Address, bigint>;
};

// -- Type-level helpers --

export type ExtractProof<C extends AirdropConfig> = C extends AirdropConfig<infer P> ? P : never;

export type ValidVariant = VariantKey;
