/**
 * Usage examples for AirdropSDK.
 * Three scenarios — one per proof strategy.
 * Run: npx tsx examples/usage.ts
 */

import { Address, toNano } from '@ton/core';
import { keyPairFromSeed } from '@ton/crypto';
import { AirdropSDK } from '../src/index.js';
import type { OnChainClaim } from '../src/index.js';

const OWNER   = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');
const USER_A  = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');
const USER_B  = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');
const JETTON  = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');

// -- 1. Signing --

function signingExample() {
  console.log('=== Signing proof ===\n');

  const seed = Buffer.alloc(32, 0xAB);
  const keyPair = keyPairFromSeed(seed);

  const sdk = AirdropSDK.create({
    proof: { kind: 'signing', secretKey: keyPair.secretKey, publicKey: keyPair.publicKey },
    asset: { kind: 'jetton', jettonWallet: JETTON },
    doubleClaim: { kind: 'map' },
    owner: OWNER,
  });

  console.log('Variant:    ', sdk.variant);

  const init = sdk.initParams;
  console.log('Public key: ', init.publicKey.toString(16));

  const claim: OnChainClaim = { claimId: 1n, recipient: USER_A, amount: toNano('100') };
  const tx = sdk.prepareClaim({ claim });

  console.log('Body bits:  ', tx.body.bits.length);
  console.log('Proof bits: ', tx.proofCell.bits.length);

  const airdropAddr = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');
  const target = sdk.claimTarget(airdropAddr, claim.claimId);
  console.log('Target ok:  ', target.equals(airdropAddr));
  console.log();
}

// -- 2. Patricia --

function patriciaExample() {
  console.log('=== Patricia proof ===\n');

  const sdk = AirdropSDK.create({
    proof: { kind: 'patricia' },
    asset: { kind: 'jetton', jettonWallet: JETTON },
    doubleClaim: { kind: 'map' },
    owner: OWNER,
  });

  console.log('Variant:', sdk.variant);
  console.log('Distribution size:', sdk.initParams.distribution.size);

  const claim: OnChainClaim = { claimId: 42n, recipient: USER_B, amount: toNano('50') };
  const tx = sdk.prepareClaim({ claim });
  console.log('Proof bits:', tx.proofCell.bits.length);
  console.log();
}

// -- 3. Merkle --

function merkleExample() {
  console.log('=== Merkle proof ===\n');

  const claims: OnChainClaim[] = [
    { claimId: 0n, recipient: USER_A, amount: toNano('100') },
    { claimId: 1n, recipient: USER_B, amount: toNano('200') },
    { claimId: 2n, recipient: OWNER,  amount: toNano('50')  },
  ];

  const sdk = AirdropSDK.create({
    proof: { kind: 'merkle', claims },
    asset: { kind: 'nft' },
    doubleClaim: { kind: 'markers' },
    owner: OWNER,
  });

  console.log('Variant:     ', sdk.variant);
  console.log('Merkle root: ', '0x' + sdk.initParams.merkleRoot.toString(16).slice(0, 16) + '...');

  const tx = sdk.prepareClaim({ claim: claims[0] });
  console.log('Proof exotic:', tx.proofCell.isExotic);
  console.log('Proof refs:  ', tx.proofCell.refs.length);
  console.log();
}

// -- 4. Type safety demo --

function typeSafetyDemo() {
  console.log('=== Type safety ===\n');

  const seed = Buffer.alloc(32, 0x01);
  const keyPair = keyPairFromSeed(seed);

  const sdk1 = AirdropSDK.create({
    proof: { kind: 'signing', secretKey: keyPair.secretKey, publicKey: keyPair.publicKey },
    asset: { kind: 'jetton', jettonWallet: JETTON },
    doubleClaim: { kind: 'map' },
    owner: OWNER,
  });

  const sdk2 = AirdropSDK.create({
    proof: { kind: 'patricia' },
    asset: { kind: 'nft' },
    doubleClaim: { kind: 'markers' },
    owner: OWNER,
  });

  const claim: OnChainClaim = { claimId: 1n, recipient: USER_A, amount: toNano('10') };

  const tx1 = sdk1.prepareClaim({ claim });
  const tx2 = sdk2.prepareClaim({ claim });

  console.log('sdk1 proof bits:', tx1.proofCell.bits.length);
  console.log('sdk2 proof bits:', tx2.proofCell.bits.length);
  console.log('sdk1 variant:', sdk1.variant);
  console.log('sdk2 variant:', sdk2.variant);
  console.log();
}

signingExample();
patriciaExample();
merkleExample();
typeSafetyDemo();
console.log('Done.');
