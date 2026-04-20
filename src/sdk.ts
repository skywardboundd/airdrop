import {
  Address, beginCell, Cell, contractAddress, Dictionary,
} from '@ton/core';
import { sign } from '@ton/crypto';
import { createHash } from 'crypto';
import type {
  AirdropConfig,
  ClaimParams,
  ContractInitParams,
  MerkleProofModule,
  OnChainClaim,
  PreparedClaim,
  ProofModule,
  SigningProofModule,
  VariantKey,
} from './types.js';
import { generateMerkleProof } from './generateMerkleProof.js';

// ClaimDrop opcode (Tact-generated from crc32c of message name).
const CLAIM_DROP_OP = 0xa93b81d1;

export class AirdropSDK<P extends ProofModule> {
  private constructor(readonly config: AirdropConfig<P>) {}

  static create<P extends ProofModule>(config: AirdropConfig<P>): AirdropSDK<P> {
    return new AirdropSDK(config);
  }

  get variant(): VariantKey {
    const { proof, asset, doubleClaim } = this.config;
    return `${proof.kind}.${asset.kind}.${doubleClaim.kind}`;
  }

  get initParams(): ContractInitParams {
    const { proof, asset, owner } = this.config;

    let merkleRoot = 0n;
    let publicKey = 0n;
    let jettonWallet: Address = owner;
    const distribution = Dictionary.empty(
      Dictionary.Keys.Address(),
      Dictionary.Values.BigVarUint(4),
    );

    switch (proof.kind) {
      case 'merkle':
        merkleRoot = computeDictMerkleRoot(proof.claims);
        break;
      case 'signing':
        publicKey = bufToBigUint(proof.publicKey);
        break;
      case 'patricia':
        break;
    }

    if (asset.kind === 'jetton') {
      jettonWallet = asset.jettonWallet;
    } else if (asset.kind === 'custom' && asset.assetAddress) {
      jettonWallet = asset.assetAddress;
    }

    return { owner, merkleRoot, publicKey, jettonWallet, distribution };
  }

  buildProofCell(params: ClaimParams<P>): Cell {
    const { claim } = params as { claim: OnChainClaim };
    const proof = this.config.proof;

    switch (proof.kind) {
      case 'merkle':
        return buildMerkleProofCell(proof, claim);
      case 'signing':
        return buildSigningProofCell(proof, claim);
      case 'patricia':
        return beginCell().endCell();
    }
  }

  prepareClaim(params: ClaimParams<P>): PreparedClaim {
    const { claim } = params as { claim: OnChainClaim };
    const proofCell = this.buildProofCell(params);

    const body = beginCell()
      .storeUint(CLAIM_DROP_OP, 32)
      .storeUint(claim.claimId, 64)
      .storeAddress(claim.recipient)
      .storeCoins(claim.amount)
      .storeRef(proofCell)
      .endCell();

    return { proofCell, body };
  }

  claimTarget(
    airdropAddress: Address,
    _claimId: bigint,
    markerInit?: { code: Cell; data: Cell },
  ): Address {
    if (this.config.doubleClaim.kind === 'map') {
      return airdropAddress;
    }
    if (!markerInit) {
      throw new Error(
        'MarkerDoubleClaim requires markerInit (compiled Marker code + data) to compute target address',
      );
    }
    return contractAddress(0, markerInit);
  }
}

// -- Signing proof builder --

function buildSigningProofCell(mod: SigningProofModule, claim: OnChainClaim): Cell {
  const payloadCell = beginCell()
    .storeUint(claim.claimId, 64)
    .storeAddress(claim.recipient)
    .storeCoins(claim.amount)
    .endCell();

  const hash = cellDataBitsHash(payloadCell);
  const signature = sign(hash, mod.secretKey);

  return beginCell()
    .storeBuffer(signature)
    .endCell();
}

/** SHA-256 of cell data bits (no descriptors). Matches TVM CHKSIGNS behavior. */
function cellDataBitsHash(cell: Cell): Buffer {
  const slice = cell.beginParse();
  const totalBits = slice.remainingBits;

  if (totalBits === 0) {
    return createHash('sha256').update(Buffer.alloc(0)).digest();
  }

  const fullBytes = Math.floor(totalBits / 8);
  const extraBits = totalBits % 8;

  if (extraBits === 0) {
    return createHash('sha256').update(slice.loadBuffer(fullBytes)).digest();
  }

  const buf = Buffer.alloc(fullBytes + 1);
  slice.loadBuffer(fullBytes).copy(buf);
  buf[fullBytes] = slice.loadUint(extraBits) << (8 - extraBits);

  return createHash('sha256').update(buf).digest();
}

// -- Merkle proof builder --

const claimValueCodec = {
  serialize(val: { recipient: Address; amount: bigint }, builder: ReturnType<typeof beginCell>) {
    builder.storeAddress(val.recipient).storeCoins(val.amount);
  },
  parse(slice: ReturnType<Cell['beginParse']>) {
    return {
      recipient: slice.loadAddress(),
      amount: slice.loadCoins(),
    };
  },
};

/** Builds Dictionary<uint256, {recipient, amount}> from claims. */
export function buildClaimsDict(
  claims: readonly OnChainClaim[],
): Dictionary<bigint, { recipient: Address; amount: bigint }> {
  const dict = Dictionary.empty(
    Dictionary.Keys.BigUint(256),
    claimValueCodec,
  );
  for (const c of claims) {
    dict.set(c.claimId, { recipient: c.recipient, amount: c.amount });
  }
  return dict;
}

export function claimsDictCell(claims: readonly OnChainClaim[]): Cell {
  const dict = buildClaimsDict(claims);
  return beginCell().storeDictDirect(dict).endCell();
}

export function computeDictMerkleRoot(claims: readonly OnChainClaim[]): bigint {
  const cell = claimsDictCell(claims);
  return bufToBigUint(cell.hash());
}

/** Builds pruned MerkleProof exotic cell for a single claim. */
function buildMerkleProofCell(mod: MerkleProofModule, claim: OnChainClaim): Cell {
  const dict = buildClaimsDict(mod.claims);
  const keyObj = Dictionary.Keys.BigUint(256);
  return generateMerkleProof(dict, [claim.claimId], keyObj);
}

function bufToBigUint(buf: Buffer): bigint {
  return BigInt('0x' + buf.toString('hex'));
}
