/**
 * Check claim status on a deployed Airdrop contract.
 *
 * AIRDROP_ADDR=EQ... CLAIM_ID=0 \
 *   npx blueprint run checkClaim --testnet --mnemonic
 *
 * Env:
 *   AIRDROP_ADDR — deployed contract address
 *   CLAIM_ID     — integer claim id to check
 */

import { Address } from '@ton/core';
import type { NetworkProvider } from '@ton/blueprint';

import { Airdrop } from '../build/Airdrop/Airdrop_Airdrop';

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
}

export async function run(provider: NetworkProvider) {
  const airdropAddress = Address.parse(env('AIRDROP_ADDR'));
  const contract = provider.open(Airdrop.fromAddress(airdropAddress));

  if (!(await provider.isContractDeployed(airdropAddress))) {
    throw new Error('Contract is not deployed at this address.');
  }

  const claimId = BigInt(env('CLAIM_ID'));
  const claimed = await contract.getClaimed(claimId);
  console.log(`Claim #${claimId}: ${claimed ? 'CLAIMED' : 'NOT CLAIMED'}`);

  const root = await contract.getMerkleRootValue();
  console.log(`Merkle root: 0x${root.toString(16)}`);
}
