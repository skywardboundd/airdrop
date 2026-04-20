/**
 * High-level facade matching the documented API.
 * Delegates to sdk.ts and generateMerkleProof.ts.
 */

import {
  Address,
  beginCell,
  Cell,
  Dictionary,
  type DictionaryKey,
} from '@ton/core';
import { generateMerkleProof, generateMerkleProofAll } from './generateMerkleProof.js';

// -- Merkle tree (dict-based) --

export type MerkleTree = {
  readonly dict: Dictionary<bigint, { recipient: Address; amount: bigint }>;
  readonly root: Buffer;
};

const claimValueCodec = {
  serialize(val: { recipient: Address; amount: bigint }, builder: ReturnType<typeof beginCell>) {
    builder.storeAddress(val.recipient).storeCoins(val.amount);
  },
  parse(slice: ReturnType<Cell['beginParse']>) {
    return { recipient: slice.loadAddress(), amount: slice.loadCoins() };
  },
};

const DICT_KEY: DictionaryKey<bigint> = Dictionary.Keys.BigUint(256);

/** Builds merkle tree from address→amount map. Auto-assigns sequential claimIds. */
export function buildMerkleTree(recipients: Map<Address, bigint>): MerkleTree {
  const dict = Dictionary.empty(DICT_KEY, claimValueCodec);
  let claimId = 0n;
  for (const [addr, amount] of recipients) {
    dict.set(claimId, { recipient: addr, amount });
    claimId++;
  }
  const dictCell = beginCell().storeDictDirect(dict).endCell();
  return { dict, root: dictCell.hash(0) };
}

/** Builds merkle tree from claims with explicit claimIds. */
export function buildMerkleTreeFromClaims(
  claims: readonly { claimId: bigint; recipient: Address; amount: bigint }[],
): MerkleTree {
  const dict = Dictionary.empty(DICT_KEY, claimValueCodec);
  for (const c of claims) {
    dict.set(c.claimId, { recipient: c.recipient, amount: c.amount });
  }
  const dictCell = beginCell().storeDictDirect(dict).endCell();
  return { dict, root: dictCell.hash(0) };
}

/** Returns pruned MerkleProof exotic cell for a single claimId. */
export function getMerkleProof(tree: MerkleTree, claimId: bigint): Cell {
  return generateMerkleProof(tree.dict, [claimId], DICT_KEY);
}

/** Batch: generates proofs for all keys in one traversal. */
export function getAllMerkleProofs(tree: MerkleTree): Map<bigint, Cell> {
  return generateMerkleProofAll(tree.dict, DICT_KEY);
}

/** Off-chain merkle proof verification. Parses exotic cell, checks root + dict entry. */
export function verifyMerkleProof(
  root: Buffer,
  proof: Cell,
  claimId: bigint,
  recipient: Address,
  amount: bigint,
): boolean {
  try {
    const slice = proof.beginParse(true);
    if (slice.loadUint(8) !== 3) return false;

    const proofHash = slice.loadBuffer(32);
    if (!proofHash.equals(root)) return false;

    slice.loadUint(16);
    const dictCell = slice.loadRef();

    const restored = Dictionary.loadDirect(DICT_KEY, claimValueCodec, dictCell.beginParse());
    const entry = restored.get(claimId);
    if (!entry) return false;

    return entry.recipient.equals(recipient) && entry.amount === amount;
  } catch {
    return false;
  }
}

// -- Patricia tree (TON hashmap / Dictionary) --

export type PatriciaTree = {
  readonly dict: Dictionary<Address, bigint>;
  readonly root: Buffer;
};

/** Builds Patricia tree from address→amount entries. */
export function buildPatriciaTree(entries: Map<Address, bigint>): PatriciaTree {
  const dict = Dictionary.empty(
    Dictionary.Keys.Address(),
    Dictionary.Values.BigVarUint(4),
  );
  for (const [addr, amount] of entries) {
    dict.set(addr, amount);
  }
  const dictCell = beginCell().storeDictDirect(dict).endCell();
  return { dict, root: dictCell.hash(0) };
}

/** Computes root hash of a Patricia dictionary. */
export function patriciaRoot(dict: Dictionary<Address, bigint>): Buffer {
  return beginCell().storeDictDirect(dict).endCell().hash(0);
}

/** Generates MerkleProof exotic cell for an address in the Patricia tree. */
export function getPatriciaProof(tree: PatriciaTree, address: Address): Cell {
  return generateMerkleProof(tree.dict, [address], Dictionary.Keys.Address());
}

/** Off-chain Patricia proof verification. */
export function verifyPatriciaProof(
  root: Buffer,
  proof: Cell,
  address: Address,
  amount: bigint,
): boolean {
  try {
    const slice = proof.beginParse(true);
    if (slice.loadUint(8) !== 3) return false;

    const proofHash = slice.loadBuffer(32);
    if (!proofHash.equals(root)) return false;

    slice.loadUint(16);
    const dictCell = slice.loadRef();

    const dict = Dictionary.loadDirect(
      Dictionary.Keys.Address(),
      Dictionary.Values.BigVarUint(4),
      dictCell.beginParse(),
    );
    const value = dict.get(address);
    return value !== undefined && value === amount;
  } catch {
    return false;
  }
}

/** Returns a new tree with an added/updated entry. */
export function updatePatriciaTree(
  tree: PatriciaTree,
  address: Address,
  amount: bigint,
): PatriciaTree {
  const cell = beginCell().storeDictDirect(tree.dict).endCell();
  const dict = Dictionary.loadDirect(
    Dictionary.Keys.Address(),
    Dictionary.Values.BigVarUint(4),
    cell.beginParse(),
  );
  dict.set(address, amount);
  const newCell = beginCell().storeDictDirect(dict).endCell();
  return { dict, root: newCell.hash(0) };
}

/** Returns a new tree with an entry removed. */
export function deleteFromPatriciaTree(
  tree: PatriciaTree,
  address: Address,
): PatriciaTree {
  const cell = beginCell().storeDictDirect(tree.dict).endCell();
  const dict = Dictionary.loadDirect(
    Dictionary.Keys.Address(),
    Dictionary.Values.BigVarUint(4),
    cell.beginParse(),
  );
  dict.delete(address);
  const newCell = beginCell().storeDictDirect(dict).endCell();
  return { dict, root: newCell.hash(0) };
}
