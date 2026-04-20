/**
 * Deploy Airdrop contract.
 *
 * 1. Compile:
 *    AIRDROP_PROOF=merkle AIRDROP_ASSET=jetton AIRDROP_DOUBLE_CLAIM=map \
 *      npm run build:airdrop-temp && npx tact --config tact.config.json
 *
 * 2. Run:
 *    MERKLE_ROOT=<hex> JETTON_WALLET=<addr> \
 *      npx blueprint run deployAirdrop --testnet --mnemonic
 *
 * Env:
 *   MERKLE_ROOT    — hex 64 chars (for merkle proof)
 *   PUBLIC_KEY     — hex 64 chars (for signing proof)
 *   JETTON_WALLET  — jetton wallet address (for jetton asset)
 *   DEPLOY_VALUE   — TON to attach (default 0.5)
 */

import { Address, Dictionary, toNano } from '@ton/core';
import type { NetworkProvider } from '@ton/blueprint';

import { Airdrop } from '../build/Airdrop/Airdrop_Airdrop';

export async function run(provider: NetworkProvider) {
  const sender = provider.sender();

  if (!sender.address) {
    throw new Error('Sender address unknown. Use --mnemonic or --tonconnect.');
  }

  const merkleRoot = process.env.MERKLE_ROOT
    ? BigInt('0x' + process.env.MERKLE_ROOT)
    : 0n;

  const publicKey = process.env.PUBLIC_KEY
    ? BigInt('0x' + process.env.PUBLIC_KEY)
    : 0n;

  const jettonWallet = process.env.JETTON_WALLET
    ? Address.parse(process.env.JETTON_WALLET)
    : sender.address;

  const distribution = Dictionary.empty(
    Dictionary.Keys.Address(),
    Dictionary.Values.BigVarUint(4),
  );

  const contract = provider.open(
    await Airdrop.fromInit(
      sender.address,
      merkleRoot,
      publicKey,
      jettonWallet,
      distribution,
    ),
  );

  console.log('Contract address:', contract.address.toString());

  if (await provider.isContractDeployed(contract.address)) {
    console.log('Contract is already deployed!');
    return;
  }

  const value = toNano(process.env.DEPLOY_VALUE ?? '0.5');
  console.log('Deploying with', Number(value) / 1e9, 'TON...');

  await contract.send(sender, { value }, {
    $$type: 'UpdateMerkleRoot' as const,
    root: merkleRoot,
  });

  console.log('Waiting for deploy...');
  await provider.waitForDeploy(contract.address, 40);

  console.log('Deployed!');
  console.log('Address:', contract.address.toString());
}
