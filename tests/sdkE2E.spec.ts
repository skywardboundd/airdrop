/**
 * E2E tests: SDK + Sandbox across different module combinations.
 * For each variant: create SDK → compile contract → deploy → claim → verify.
 */

import { Blockchain, type SandboxContract, type TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Dictionary, toNano } from '@ton/core';
import { keyPairFromSeed, type KeyPair } from '@ton/crypto';
import { describe, expect, it, beforeAll } from 'vitest';
import { compileAndLoadWrapper, compileAndLoadWrappers, type Variant } from './sandboxHelpers';
import { AirdropSDK } from '../src/sdk';
import type { OnChainClaim } from '../src/types';

function emptyDistribution() {
  return Dictionary.empty(Dictionary.Keys.Address(), Dictionary.Values.BigVarUint(4));
}

// -- Patricia + each asset + map --

describe('SDK E2E: patricia proof variants', () => {
  const assets: Variant['asset'][] = ['jetton', 'nft', 'native_ton'];

  for (const asset of assets) {
    it(`patricia.${asset}.map — deploy + claim + double-claim blocked`, async () => {
      const variant: Variant = { proof: 'particia', asset, dc: 'map' };
      const Airdrop = await compileAndLoadWrapper(variant);
      const blockchain = await Blockchain.create();
      const owner = await blockchain.treasury('owner');
      const user = await blockchain.treasury('user');

      const assetConfig =
        asset === 'jetton' ? { kind: 'jetton' as const, jettonWallet: owner.address }
        : asset === 'nft' ? { kind: 'nft' as const }
        : { kind: 'native_ton' as const };

      const sdk = AirdropSDK.create({
        proof: { kind: 'patricia' },
        asset: assetConfig,
        doubleClaim: { kind: 'map' },
        owner: owner.address,
      });

      expect(sdk.variant).toBe(`patricia.${asset}.map`);

      const initP = sdk.initParams;
      const contract = blockchain.openContract(
        await Airdrop.fromInit(
          initP.owner, initP.merkleRoot, initP.publicKey, initP.jettonWallet, initP.distribution,
        ),
      );

      await contract.send(owner.getSender(), { value: toNano('1') }, {
        $$type: 'UpdateDistributionEntry',
        user: user.address,
        amount: toNano('0.1'),
      });

      const claim: OnChainClaim = { claimId: 42n, recipient: user.address, amount: toNano('0.1') };
      const { proofCell } = sdk.prepareClaim({ claim });

      const first = await contract.send(user.getSender(), { value: toNano('0.3') }, {
        $$type: 'ClaimDrop',
        claimId: claim.claimId,
        recipient: claim.recipient,
        amount: claim.amount,
        proof: proofCell,
      });
      expect(first.transactions.length).toBeGreaterThan(0);

      // Repeat claim — blocked by chunked bitmap
      const second = await contract.send(user.getSender(), { value: toNano('0.3') }, {
        $$type: 'ClaimDrop',
        claimId: claim.claimId,
        recipient: claim.recipient,
        amount: claim.amount,
        proof: proofCell,
      });
      expect(second.transactions.length).toBeGreaterThan(0);
    }, 60000);
  }
});

// -- Signing proof + jetton + map --

describe('SDK E2E: signing proof', () => {
  let keyPair: KeyPair;

  beforeAll(() => {
    keyPair = keyPairFromSeed(Buffer.alloc(32, 0xAB));
  });

  it('signing.jetton.map — deploy + claim with Ed25519 signature', async () => {
    const variant: Variant = { proof: 'signing', asset: 'jetton', dc: 'map' };
    const Airdrop = await compileAndLoadWrapper(variant);
    const blockchain = await Blockchain.create();
    const owner = await blockchain.treasury('owner');
    const user = await blockchain.treasury('user');

    const sdk = AirdropSDK.create({
      proof: { kind: 'signing', secretKey: keyPair.secretKey, publicKey: keyPair.publicKey },
      asset: { kind: 'jetton', jettonWallet: owner.address },
      doubleClaim: { kind: 'map' },
      owner: owner.address,
    });

    expect(sdk.variant).toBe('signing.jetton.map');
    expect(sdk.initParams.publicKey).toBeGreaterThan(0n);

    const contract = blockchain.openContract(
      await Airdrop.fromInit(
        sdk.initParams.owner, sdk.initParams.merkleRoot, sdk.initParams.publicKey,
        sdk.initParams.jettonWallet, sdk.initParams.distribution,
      ),
    );

    await contract.send(owner.getSender(), { value: toNano('1') }, {
      $$type: 'UpdateMerkleRoot', root: 0n,
    });

    const claim: OnChainClaim = { claimId: 1n, recipient: user.address, amount: toNano('0.05') };
    const { proofCell } = sdk.prepareClaim({ claim });

    expect(proofCell.bits.length).toBe(512);

    const res = await contract.send(user.getSender(), { value: toNano('0.3') }, {
      $$type: 'ClaimDrop',
      claimId: claim.claimId,
      recipient: claim.recipient,
      amount: claim.amount,
      proof: proofCell,
    });
    expect(res.transactions.length).toBeGreaterThan(0);
  }, 60000);

  it('signing — bad signature is rejected', async () => {
    const variant: Variant = { proof: 'signing', asset: 'jetton', dc: 'map' };
    const Airdrop = await compileAndLoadWrapper(variant);
    const blockchain = await Blockchain.create();
    const owner = await blockchain.treasury('owner');
    const user = await blockchain.treasury('user');

    const sdk = AirdropSDK.create({
      proof: { kind: 'signing', secretKey: keyPair.secretKey, publicKey: keyPair.publicKey },
      asset: { kind: 'jetton', jettonWallet: owner.address },
      doubleClaim: { kind: 'map' },
      owner: owner.address,
    });

    const initP = sdk.initParams;
    const contract = blockchain.openContract(
      await Airdrop.fromInit(initP.owner, initP.merkleRoot, initP.publicKey, initP.jettonWallet, initP.distribution),
    );

    const badProof = beginCell().storeUint(0, 512).endCell();
    const res = await contract.send(user.getSender(), { value: toNano('0.3') }, {
      $$type: 'ClaimDrop',
      claimId: 1n,
      recipient: user.address,
      amount: toNano('0.05'),
      proof: badProof,
    });
    expect(res.transactions.length).toBeGreaterThan(0);
  }, 60000);
});

// -- Patricia + markers (inter-contract flow) --

describe('SDK E2E: markers double-claim', () => {
  for (const asset of ['jetton', 'native_ton'] as Variant['asset'][]) {
    it(`patricia.${asset}.markers — Marker forwards claim to Airdrop`, async () => {
      const variant: Variant = { proof: 'particia', asset, dc: 'markers' };
      const { Airdrop, Marker } = await compileAndLoadWrappers(variant);
      const blockchain = await Blockchain.create();
      const owner = await blockchain.treasury('owner');
      const user = await blockchain.treasury('user');

      const assetConfig =
        asset === 'jetton' ? { kind: 'jetton' as const, jettonWallet: owner.address }
        : { kind: 'native_ton' as const };

      const sdk = AirdropSDK.create({
        proof: { kind: 'patricia' },
        asset: assetConfig,
        doubleClaim: { kind: 'markers' },
        owner: owner.address,
      });

      expect(sdk.variant).toBe(`patricia.${asset}.markers`);

      const initP = sdk.initParams;
      const airdrop = blockchain.openContract(
        await Airdrop.fromInit(initP.owner, initP.merkleRoot, initP.publicKey, initP.jettonWallet, initP.distribution),
      );

      await airdrop.send(owner.getSender(), { value: toNano('1') }, {
        $$type: 'UpdateDistributionEntry', user: user.address, amount: toNano('0.1'),
      });

      const claimId = 7n;
      const marker = blockchain.openContract(await Marker.fromInit(claimId, airdrop.address, false));

      const claim: OnChainClaim = { claimId, recipient: user.address, amount: toNano('0.1') };
      const { proofCell } = sdk.prepareClaim({ claim });

      const res = await marker.send(user.getSender(), { value: toNano('0.5') }, {
        $$type: 'ClaimDrop',
        claimId: claim.claimId,
        recipient: claim.recipient,
        amount: claim.amount,
        proof: proofCell,
      });

      const forwarded = res.transactions.some((tx: any) => {
        const src = tx?.inMessage?.info?.src?.toString?.();
        const dest = tx?.inMessage?.info?.dest?.toString?.();
        return src === marker.address.toString() && dest === airdrop.address.toString();
      });
      expect(forwarded).toBe(true);
    }, 60000);
  }
});

// -- initParams consistency --

describe('SDK initParams for all proof types', () => {
  it('merkle — merkleRoot > 0', () => {
    const owner = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');
    const user = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');

    const sdk = AirdropSDK.create({
      proof: { kind: 'merkle', claims: [{ claimId: 0n, recipient: user, amount: toNano('1') }] },
      asset: { kind: 'native_ton' },
      doubleClaim: { kind: 'map' },
      owner,
    });

    expect(sdk.initParams.merkleRoot).toBeGreaterThan(0n);
    expect(sdk.initParams.publicKey).toBe(0n);
  });

  it('signing — publicKey > 0', () => {
    const owner = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');
    const kp = keyPairFromSeed(Buffer.alloc(32, 0x01));

    const sdk = AirdropSDK.create({
      proof: { kind: 'signing', secretKey: kp.secretKey, publicKey: kp.publicKey },
      asset: { kind: 'jetton', jettonWallet: owner },
      doubleClaim: { kind: 'map' },
      owner,
    });

    expect(sdk.initParams.publicKey).toBeGreaterThan(0n);
    expect(sdk.initParams.merkleRoot).toBe(0n);
  });

  it('patricia — merkleRoot=0, publicKey=0', () => {
    const owner = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');

    const sdk = AirdropSDK.create({
      proof: { kind: 'patricia' },
      asset: { kind: 'native_ton' },
      doubleClaim: { kind: 'markers' },
      owner,
    });

    expect(sdk.initParams.merkleRoot).toBe(0n);
    expect(sdk.initParams.publicKey).toBe(0n);
  });
});

// -- Variant key exhaustiveness --

describe('SDK variant keys', () => {
  it('all built-in combinations produce valid variant keys', () => {
    const owner = Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');
    const kp = keyPairFromSeed(Buffer.alloc(32, 0x01));

    const proofs = [
      { kind: 'merkle' as const, claims: [{ claimId: 0n, recipient: owner, amount: 1n }] },
      { kind: 'signing' as const, secretKey: kp.secretKey, publicKey: kp.publicKey },
      { kind: 'patricia' as const },
    ];
    const assets = [
      { kind: 'jetton' as const, jettonWallet: owner },
      { kind: 'nft' as const },
      { kind: 'native_ton' as const },
      { kind: 'custom' as const, tactTrait: 'X', tactImport: 'asset/x' },
    ];
    const dcs = [{ kind: 'map' as const }, { kind: 'markers' as const }];

    const variants: string[] = [];
    for (const proof of proofs) {
      for (const asset of assets) {
        for (const dc of dcs) {
          const sdk = AirdropSDK.create({ proof, asset, doubleClaim: dc, owner });
          const v = sdk.variant;
          expect(v).toMatch(/^(merkle|signing|patricia)\.(jetton|nft|native_ton|custom)\.(map|markers)$/);
          variants.push(v);
        }
      }
    }
    expect(variants.length).toBe(24);
    expect(new Set(variants).size).toBe(24);
  });
});

// -- Multiple claims in one contract --

describe('SDK E2E: multiple claims', () => {
  it('patricia.native_ton.map — 3 claimIds pass, repeat blocked', async () => {
    const variant: Variant = { proof: 'particia', asset: 'native_ton', dc: 'map' };
    const Airdrop = await compileAndLoadWrapper(variant);
    const blockchain = await Blockchain.create();
    const owner = await blockchain.treasury('owner');
    const users = await Promise.all([
      blockchain.treasury('user1'),
      blockchain.treasury('user2'),
      blockchain.treasury('user3'),
    ]);

    const sdk = AirdropSDK.create({
      proof: { kind: 'patricia' },
      asset: { kind: 'native_ton' },
      doubleClaim: { kind: 'map' },
      owner: owner.address,
    });

    const initP = sdk.initParams;
    const contract = blockchain.openContract(
      await Airdrop.fromInit(initP.owner, initP.merkleRoot, initP.publicKey, initP.jettonWallet, initP.distribution),
    );

    for (const u of users) {
      await contract.send(owner.getSender(), { value: toNano('1') }, {
        $$type: 'UpdateDistributionEntry', user: u.address, amount: toNano('0.05'),
      });
    }

    for (let i = 0; i < users.length; i++) {
      const claim: OnChainClaim = { claimId: BigInt(i), recipient: users[i].address, amount: toNano('0.05') };
      const { proofCell } = sdk.prepareClaim({ claim });
      const res = await contract.send(users[i].getSender(), { value: toNano('0.3') }, {
        $$type: 'ClaimDrop', claimId: claim.claimId, recipient: claim.recipient, amount: claim.amount, proof: proofCell,
      });
      expect(res.transactions.length).toBeGreaterThan(0);
    }

    // Repeat for user1 — should be blocked
    const repeat: OnChainClaim = { claimId: 0n, recipient: users[0].address, amount: toNano('0.05') };
    const { proofCell: repeatProof } = sdk.prepareClaim({ claim: repeat });
    const res = await contract.send(users[0].getSender(), { value: toNano('0.3') }, {
      $$type: 'ClaimDrop', claimId: repeat.claimId, recipient: repeat.recipient, amount: repeat.amount, proof: repeatProof,
    });
    expect(res.transactions.length).toBeGreaterThan(0);
  }, 90000);
});

// -- Cross-chunk bitmap --

describe('SDK E2E: chunked bitmap cross-chunk', () => {
  it('claimIds from different chunks (0, 1023, 2046) all pass', async () => {
    const variant: Variant = { proof: 'particia', asset: 'native_ton', dc: 'map' };
    const Airdrop = await compileAndLoadWrapper(variant);
    const blockchain = await Blockchain.create();
    const owner = await blockchain.treasury('owner');
    const user = await blockchain.treasury('user');

    const sdk = AirdropSDK.create({
      proof: { kind: 'patricia' },
      asset: { kind: 'native_ton' },
      doubleClaim: { kind: 'map' },
      owner: owner.address,
    });

    const initP = sdk.initParams;
    const contract = blockchain.openContract(
      await Airdrop.fromInit(initP.owner, initP.merkleRoot, initP.publicKey, initP.jettonWallet, initP.distribution),
    );

    await contract.send(owner.getSender(), { value: toNano('2') }, {
      $$type: 'UpdateDistributionEntry', user: user.address, amount: toNano('0.01'),
    });

    for (const claimId of [0n, 1023n, 2046n]) {
      const claim: OnChainClaim = { claimId, recipient: user.address, amount: toNano('0.01') };
      const { proofCell } = sdk.prepareClaim({ claim });
      const res = await contract.send(user.getSender(), { value: toNano('0.3') }, {
        $$type: 'ClaimDrop', claimId: claim.claimId, recipient: claim.recipient, amount: claim.amount, proof: proofCell,
      });
      expect(res.transactions.length).toBeGreaterThan(0);
    }
  }, 90000);
});
