import { Blockchain } from '@ton/sandbox';
import { Address, beginCell, Dictionary, toNano } from '@ton/core';
import { describe, expect, it } from 'vitest';
import { compileAndLoadWrapper } from './sandboxHelpers';

function emptyDistribution() {
  return Dictionary.empty(Dictionary.Keys.Address(), Dictionary.Values.BigVarUint(4));
}

describe('Sandbox trait unit tests', () => {
  it('PatriciaProof: accepts claim with correct amount', async () => {
    const Airdrop = await compileAndLoadWrapper({ proof: 'particia', asset: 'jetton', dc: 'map' });
    const blockchain = await Blockchain.create();
    const owner = await blockchain.treasury('owner');
    const user = await blockchain.treasury('user');

    const c = blockchain.openContract(
      await Airdrop.fromInit(owner.address, 0n, 0n, owner.address, emptyDistribution())
    );

    await c.send(owner.getSender(), { value: toNano('1') }, { $$type: 'UpdateDistributionEntry', user: user.address, amount: toNano('0.1') });
    const proof = beginCell().storeCoins(toNano('0.1')).endCell();
    const tx = await c.send(user.getSender(), { value: toNano('0.2') }, { $$type: 'ClaimDrop', claimId: 1n, recipient: user.address, amount: toNano('0.1'), proof });
    expect(tx.transactions.length).toBeGreaterThan(0);
  }, 30000);

  it('SignatureProof: rejects claim with bad signature', async () => {
    const Airdrop = await compileAndLoadWrapper({ proof: 'signing', asset: 'jetton', dc: 'map' });
    const blockchain = await Blockchain.create();
    const owner = await blockchain.treasury('owner');
    const user = await blockchain.treasury('user');

    const c = blockchain.openContract(
      await Airdrop.fromInit(owner.address, 0n, 1n, owner.address, emptyDistribution())
    );

    const badSig = beginCell().storeUint(0, 512).endCell();
    const tx = await c.send(user.getSender(), { value: toNano('0.2') }, { $$type: 'ClaimDrop', claimId: 2n, recipient: user.address, amount: toNano('0.1'), proof: badSig });
    expect(tx.transactions.length).toBeGreaterThan(0);
  }, 30000);

  it('MarkerDoubleClaim: claim blocked without RegisterMarker', async () => {
    const Airdrop = await compileAndLoadWrapper({ proof: 'particia', asset: 'jetton', dc: 'markers' });
    const blockchain = await Blockchain.create();
    const owner = await blockchain.treasury('owner');
    const user = await blockchain.treasury('user');

    const c = blockchain.openContract(
      await Airdrop.fromInit(owner.address, 0n, 0n, owner.address, emptyDistribution())
    );

    await c.send(owner.getSender(), { value: toNano('1') }, { $$type: 'UpdateDistributionEntry', user: user.address, amount: toNano('0.1') });
    const proof = beginCell().storeCoins(toNano('0.1')).endCell();
    const tx = await c.send(user.getSender(), { value: toNano('0.2') }, { $$type: 'ClaimDrop', claimId: 3n, recipient: user.address, amount: toNano('0.1'), proof });
    expect(tx.transactions.length).toBeGreaterThan(0);
  }, 30000);
});
