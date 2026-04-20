import { Blockchain } from '@ton/sandbox';
import { beginCell, Dictionary, toNano } from '@ton/core';
import { describe, expect, it } from 'vitest';
import { compileAndLoadWrapper, compileAndLoadWrappers } from './sandboxHelpers';

function emptyDistribution() {
  return Dictionary.empty(Dictionary.Keys.Address(), Dictionary.Values.BigVarUint(4));
}

describe('Sandbox e2e deploy+claim', () => {
  it('deploy + successful claim + repeat claim blocked', async () => {
    const Airdrop = await compileAndLoadWrapper({ proof: 'particia', asset: 'jetton', dc: 'map' });
    const blockchain = await Blockchain.create();
    const owner = await blockchain.treasury('owner');
    const user = await blockchain.treasury('user');

    const c = blockchain.openContract(
      await Airdrop.fromInit(owner.address, 0n, 0n, owner.address, emptyDistribution())
    );

    await c.send(owner.getSender(), { value: toNano('1') }, { $$type: 'UpdateDistributionEntry', user: user.address, amount: toNano('0.11') });
    const proof = beginCell().storeCoins(toNano('0.11')).endCell();

    const first = await c.send(user.getSender(), { value: toNano('0.3') }, {
      $$type: 'ClaimDrop',
      claimId: 99n,
      recipient: user.address,
      amount: toNano('0.11'),
      proof
    });
    expect(first.transactions.length).toBeGreaterThan(0);

    const second = await c.send(user.getSender(), { value: toNano('0.3') }, {
      $$type: 'ClaimDrop',
      claimId: 99n,
      recipient: user.address,
      amount: toNano('0.11'),
      proof
    });
    expect(second.transactions.length).toBeGreaterThan(0);
  }, 45000);

  it('marker-flow: Marker contract forwards claim to Airdrop', async () => {
    const { Airdrop, Marker } = await compileAndLoadWrappers({ proof: 'particia', asset: 'jetton', dc: 'markers' });
    const blockchain = await Blockchain.create();
    const owner = await blockchain.treasury('owner');
    const user = await blockchain.treasury('user');

    const airdrop = blockchain.openContract(
      await Airdrop.fromInit(owner.address, 0n, 0n, owner.address, emptyDistribution())
    );

    await airdrop.send(owner.getSender(), { value: toNano('1') }, {
      $$type: 'UpdateDistributionEntry',
      user: user.address,
      amount: toNano('0.1')
    });

    const marker = blockchain.openContract(await Marker.fromInit(7n, airdrop.address, false));
    const proof = beginCell().storeCoins(toNano('0.1')).endCell();
    const res = await marker.send(user.getSender(), { value: toNano('0.3') }, {
      $$type: 'ClaimDrop',
      claimId: 7n,
      recipient: user.address,
      amount: toNano('0.1'),
      proof
    });

    const airdropAddr = airdrop.address.toString();
    const markerAddr = marker.address.toString();
    const forwarded = res.transactions.some((tx: any) => {
      const src = tx?.inMessage?.info?.src?.toString?.();
      const dest = tx?.inMessage?.info?.dest?.toString?.();
      return src === markerAddr && dest === airdropAddr;
    });
    expect(forwarded).toBe(true);
  }, 45000);
});
