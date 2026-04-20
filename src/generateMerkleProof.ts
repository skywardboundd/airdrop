/**
 * MerkleProof exotic cell generation for TON Dictionary.
 * Adapted from @ton/core internals to public API.
 * Produces pruned proofs: only the branch to the target key is kept,
 * everything else is replaced with PrunedBranch exotic cells.
 */

import {
  beginCell,
  Cell,
  Dictionary,
  type DictionaryKey,
  type DictionaryKeyTypes,
  type Slice,
} from '@ton/core';

// -- Exotic cell constructors --

function convertToPrunedBranch(c: Cell): Cell {
  return beginCell()
    .storeUint(1, 8)
    .storeUint(1, 8)
    .storeBuffer(c.hash(0))
    .storeUint(c.depth(0), 16)
    .endCell({ exotic: true });
}

function convertToMerkleProof(c: Cell): Cell {
  return beginCell()
    .storeUint(3, 8)
    .storeBuffer(c.hash(0))
    .storeUint(c.depth(0), 16)
    .storeRef(c)
    .endCell({ exotic: true });
}

// -- Hashmap label parser --

function readUnaryLength(slice: Slice): number {
  let len = 0;
  while (slice.loadBit()) {
    len++;
  }
  return len;
}

// -- Core: recursive dict tree pruning --

function doGenerateMerkleProof(
  prefix: string,
  slice: Slice,
  n: number,
  keys: string[],
): Cell {
  const originalCell = slice.asCell();

  if (keys.length === 0) {
    return convertToPrunedBranch(originalCell);
  }

  let pp = prefix;
  const lb0 = slice.loadBit() ? 1 : 0;
  let prefixLength: number;

  if (lb0 === 0) {
    prefixLength = readUnaryLength(slice);
    for (let i = 0; i < prefixLength; i++) {
      pp += slice.loadBit() ? '1' : '0';
    }
  } else {
    const lb1 = slice.loadBit() ? 1 : 0;
    if (lb1 === 0) {
      prefixLength = slice.loadUint(Math.ceil(Math.log2(n + 1)));
      for (let i = 0; i < prefixLength; i++) {
        pp += slice.loadBit() ? '1' : '0';
      }
    } else {
      const bit = slice.loadBit() ? '1' : '0';
      prefixLength = slice.loadUint(Math.ceil(Math.log2(n + 1)));
      for (let i = 0; i < prefixLength; i++) {
        pp += bit;
      }
    }
  }

  if (n - prefixLength === 0) {
    return originalCell;
  }

  const sl = originalCell.beginParse();
  let left = sl.loadRef();
  let right = sl.loadRef();

  if (!left.isExotic) {
    const leftKeys = keys.filter((k) => (pp + '0') === k.slice(0, pp.length + 1));
    left = doGenerateMerkleProof(pp + '0', left.beginParse(), n - prefixLength - 1, leftKeys);
  }

  if (!right.isExotic) {
    const rightKeys = keys.filter((k) => (pp + '1') === k.slice(0, pp.length + 1));
    right = doGenerateMerkleProof(pp + '1', right.beginParse(), n - prefixLength - 1, rightKeys);
  }

  return beginCell()
    .storeSlice(sl)
    .storeRef(left)
    .storeRef(right)
    .endCell();
}

// -- Public API --

/** Generates pruned dict cell (without MerkleProof wrapper) for given keys. */
export function generateMerkleProofDirect<K extends DictionaryKeyTypes, V>(
  dict: Dictionary<K, V>,
  keys: K[],
  keyObject: DictionaryKey<K>,
): Cell {
  for (const key of keys) {
    if (!dict.has(key)) {
      throw new Error(`Trying to generate merkle proof for a missing key "${key}"`);
    }
  }
  const s = beginCell().storeDictDirect(dict).asSlice();
  return doGenerateMerkleProof(
    '',
    s,
    keyObject.bits,
    keys.map((key) => keyObject.serialize(key).toString(2).padStart(keyObject.bits, '0')),
  );
}

/** Generates MerkleProof exotic cell (type 3) for given keys. */
export function generateMerkleProof<K extends DictionaryKeyTypes, V>(
  dict: Dictionary<K, V>,
  keys: K[],
  keyObject: DictionaryKey<K>,
): Cell {
  return convertToMerkleProof(generateMerkleProofDirect(dict, keys, keyObject));
}

/** Batch: generates MerkleProof for every key in one tree traversal. */
export function generateMerkleProofAll<K extends DictionaryKeyTypes, V>(
  dict: Dictionary<K, V>,
  keyObject: DictionaryKey<K>,
): Map<K, Cell> {
  type MemoryNode = [slice: Slice, ref: Cell, refNo: 0 | 1];

  const path: MemoryNode[] = [];
  const resultMap = new Map<bigint, Cell>();

  const rec = (prefix: bigint, originalCell: Cell, n: number) => {
    const slice = originalCell.beginParse();

    if (slice.loadBit()) {
      if (slice.loadBit()) {
        const bit = slice.loadBit();
        const prefixLength = slice.loadUint(Math.ceil(Math.log2(n + 1)));
        n -= prefixLength;
        prefix <<= BigInt(prefixLength);
        prefix |= bit ? BigInt((1 << prefixLength) - 1) : 0n;
      } else {
        const prefixLength = slice.loadUint(Math.ceil(Math.log2(n + 1)));
        n -= prefixLength;
        prefix = (prefix << BigInt(prefixLength)) | BigInt(slice.loadUint(prefixLength));
      }
    } else {
      const prefixLength = readUnaryLength(slice);
      n -= prefixLength;
      prefix = (prefix << BigInt(prefixLength)) | BigInt(slice.loadUint(prefixLength));
    }

    if (n === 0) {
      let lastNode = originalCell;
      for (let i = path.length - 1; i >= 0; i--) {
        const [sl, ref, refNo] = path[i];
        if (refNo) {
          lastNode = beginCell().storeSlice(sl).storeRef(ref).storeRef(lastNode).endCell();
        } else {
          lastNode = beginCell().storeSlice(sl).storeRef(lastNode).storeRef(ref).endCell();
        }
      }
      resultMap.set(prefix, convertToMerkleProof(lastNode));
    } else {
      const sl = originalCell.beginParse();
      const left = sl.loadRef();
      const right = sl.loadRef();

      path.push([sl, convertToPrunedBranch(right), 0]);
      rec(prefix << 1n, left, n - 1);
      path.pop();

      path.push([sl, convertToPrunedBranch(left), 1]);
      rec((prefix << 1n) + 1n, right, n - 1);
      path.pop();
    }
  };

  rec(0n, beginCell().storeDictDirect(dict).endCell(), keyObject.bits);

  const result = new Map<K, Cell>();
  for (const key of dict.keys()) {
    const serialized = keyObject.serialize(key);
    const proof = resultMap.get(serialized);
    result.set(key, proof!);
  }
  return result;
}
