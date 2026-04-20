// -- SDK --
export { AirdropSDK } from './sdk.js';
export { buildClaimsDict, claimsDictCell, computeDictMerkleRoot } from './sdk.js';

// -- Merkle proof (pruned dict exotic cells) --
export {
  generateMerkleProof,
  generateMerkleProofDirect,
  generateMerkleProofAll,
} from './generateMerkleProof.js';

// -- Types --
export type {
  OnChainClaim,

  ProofModule,
  ProofKind,
  MerkleProofModule,
  SigningProofModule,
  PatriciaProofModule,

  AssetModule,
  AssetKind,
  JettonAssetModule,
  NftAssetModule,
  NativeTonAssetModule,
  CustomAssetModule,

  DoubleClaimModule,
  DoubleClaimKind,
  MapDoubleClaimModule,
  MarkerDoubleClaimModule,

  AirdropConfig,
  ClaimParams,
  ContractInitParams,
  PreparedClaim,

  VariantKey,
  ValidVariant,
  ExtractProof,
} from './types.js';

// -- Facade (high-level API) --
export {
  buildMerkleTree as buildMerkleTreeFromRecipients,
  buildMerkleTreeFromClaims,
  getMerkleProof,
  getAllMerkleProofs,
  verifyMerkleProof as verifyMerkleProofExotic,
  type MerkleTree,

  buildPatriciaTree,
  patriciaRoot,
  getPatriciaProof,
  verifyPatriciaProof,
  updatePatriciaTree,
  deleteFromPatriciaTree,
  type PatriciaTree,
} from './facade.js';

// -- Off-chain utilities (legacy) --
export {
  claimLeaf,
  foldHash,
  buildMerkleTree,
  merkleRoot,
  buildProof,
  verifyMerkleProof,
  type Claim,
  type ProofStep,
} from './merkle.js';

export {
  verifyMerkle,
  verifySignatureLike,
  verifyPatriciaLike,
} from './proofStrategies.js';

export {
  type DoubleClaimStore,
  MapDoubleClaimStore,
  MarkerDoubleClaimStore,
} from './doubleClaim.js';
