/**
 * Claim from a deployed Airdrop contract.
 *
 * AIRDROP_ADDR=EQ... CLAIM_ID=0 RECIPIENT=EQ... AMOUNT=1000000000 \
 *   PROOF_KIND=patricia \
 *   npx blueprint run claimAirdrop --testnet --mnemonic
 *
 * Env:
 *   AIRDROP_ADDR — deployed contract address
 *   CLAIM_ID     — integer claim id
 *   RECIPIENT    — recipient address (default = sender)
 *   AMOUNT       — amount in nanotons
 *   PROOF_KIND   — merkle | signing | patricia
 *   PROOF_BOC    — base64 BOC of merkle proof cell (for merkle)
 *   SIGNATURE    — hex Ed25519 signature, 128 chars (for signing)
 *   CLAIM_VALUE  — TON to attach for gas (default 0.3)
 */

import { Address, beginCell, Cell, toNano } from '@ton/core';
import type { NetworkProvider } from '@ton/blueprint';

import { Airdrop } from '../build/Airdrop/Airdrop_Airdrop';

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
}

export async function run(provider: NetworkProvider) {
  const sender = provider.sender();

  if (!sender.address) {
    throw new Error('Sender address unknown. Use --mnemonic or --tonconnect.');
  }

  const airdropAddress = Address.parse(env('AIRDROP_ADDR'));
  const contract = provider.open(Airdrop.fromAddress(airdropAddress));

  if (!(await provider.isContractDeployed(airdropAddress))) {
    throw new Error('Contract is not deployed at this address.');
  }

  const claimId = BigInt(env('CLAIM_ID'));
  const recipient = process.env.RECIPIENT
    ? Address.parse(process.env.RECIPIENT)
    : sender.address;
  const amount = BigInt(env('AMOUNT'));

  const proofKind = env('PROOF_KIND');
  let proofCell: Cell;

  switch (proofKind) {
    case 'merkle':
      proofCell = Cell.fromBoc(Buffer.from(env('PROOF_BOC'), 'base64'))[0];
      break;
    case 'signing':
      proofCell = beginCell()
        .storeBuffer(Buffer.from(env('SIGNATURE'), 'hex'))
        .endCell();
      break;
    case 'patricia':
      proofCell = beginCell().endCell();
      break;
    default:
      throw new Error(`Unknown PROOF_KIND: ${proofKind}`);
  }

  const value = toNano(process.env.CLAIM_VALUE ?? '0.3');

  console.log(`ClaimDrop: id=${claimId} recipient=${recipient} amount=${amount}`);

  await contract.send(sender, { value }, {
    $$type: 'ClaimDrop' as const,
    claimId,
    recipient,
    amount,
    proof: proofCell,
  });

  console.log('Transaction sent!');
}
