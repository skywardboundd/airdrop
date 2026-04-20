import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

type ProofVariant = 'merkle' | 'signing' | 'particia';
type AssetVariant = 'jetton' | 'nft' | 'native_ton' | 'custom';
type DoubleClaimVariant = 'map' | 'markers';

const proofVariant = (process.env.AIRDROP_PROOF ?? 'merkle') as ProofVariant;
const assetVariant = (process.env.AIRDROP_ASSET ?? 'jetton') as AssetVariant;
const doubleClaimVariant = (process.env.AIRDROP_DOUBLE_CLAIM ?? 'map') as DoubleClaimVariant;

// For custom asset: user provides import path and trait name via env
const customAssetImport = process.env.AIRDROP_ASSET_IMPORT;   // e.g. "asset/my-sbt"
const customAssetTrait  = process.env.AIRDROP_ASSET_TRAIT;     // e.g. "SbtAsset"

const proofImportByVariant: Record<ProofVariant, string> = {
  merkle: 'proof/merkle',
  signing: 'proof/signing',
  particia: 'proof/particia'
};

const proofTraitByVariant: Record<ProofVariant, string> = {
  merkle: 'MerkleProof',
  signing: 'SignatureProof',
  particia: 'PatriciaProof'
};

const builtinAssetImport: Record<string, string> = {
  jetton: 'asset/jetton',
  nft: 'asset/nft',
  native_ton: 'asset/native',
};

const builtinAssetTrait: Record<string, string> = {
  jetton: 'Jetton',
  nft: 'NFT',
  native_ton: 'NativeTon',
};

const doubleClaimImportByVariant: Record<DoubleClaimVariant, string> = {
  map: 'double-claim/map',
  markers: 'double-claim/markers'
};

const doubleClaimTraitByVariant: Record<DoubleClaimVariant, string> = {
  map: 'MapDoubleClaim',
  markers: 'MarkerDoubleClaim'
};

function resolveAsset(): { import: string; trait: string } {
  if (assetVariant === 'custom') {
    if (!customAssetImport || !customAssetTrait) {
      throw new Error(
        'AIRDROP_ASSET=custom requires AIRDROP_ASSET_IMPORT and AIRDROP_ASSET_TRAIT env vars.\n' +
        'Example: AIRDROP_ASSET_IMPORT=asset/my-sbt AIRDROP_ASSET_TRAIT=SbtAsset'
      );
    }
    return { import: customAssetImport, trait: customAssetTrait };
  }
  const imp = builtinAssetImport[assetVariant];
  const tr = builtinAssetTrait[assetVariant];
  if (!imp || !tr) {
    throw new Error(`Unsupported AIRDROP_ASSET="${assetVariant}"`);
  }
  return { import: imp, trait: tr };
}

function assertValid(): void {
  if (!(proofVariant in proofImportByVariant)) {
    throw new Error(`Unsupported AIRDROP_PROOF="${proofVariant}"`);
  }
  resolveAsset(); // validates asset
  if (!(doubleClaimVariant in doubleClaimImportByVariant)) {
    throw new Error(`Unsupported AIRDROP_DOUBLE_CLAIM="${doubleClaimVariant}"`);
  }
}

function buildContractSource(): string {
  const proofImport = proofImportByVariant[proofVariant];
  const proofTrait = proofTraitByVariant[proofVariant];
  const asset = resolveAsset();
  const dcImport = doubleClaimImportByVariant[doubleClaimVariant];
  const dcTrait = doubleClaimTraitByVariant[doubleClaimVariant];

  return `import "./messages";
import "./${proofImport}";
import "./${asset.import}";
import "./${dcImport}";

// AUTO-GENERATED FILE. DO NOT EDIT MANUALLY.
// proof=${proofVariant}, asset=${assetVariant}${assetVariant === 'custom' ? `(${asset.trait})` : ''}, doubleClaim=${doubleClaimVariant}
contract Airdrop with ${proofTrait}, ${asset.trait}, ${dcTrait} {
    owner: Address;
    merkleRoot: Int as uint256;
    publicKey: Int as uint256;
    jettonWallet: Address;
    distribution: map<Address, Int as coins>;
    claimBitmap: map<Int as uint64, Cell>;
    markerClaimed: map<Address, Bool>;
    nftByClaim: map<Int as uint64, Address>;

    init(
        owner: Address,
        merkleRoot: Int as uint256,
        publicKey: Int as uint256,
        jettonWallet: Address,
        distribution: map<Address, Int as coins>
    ) {
        self.owner = owner;
        self.merkleRoot = merkleRoot;
        self.publicKey = publicKey;
        self.jettonWallet = jettonWallet;
        self.distribution = distribution;
        self.claimBitmap = emptyMap();
        self.markerClaimed = emptyMap();
        self.nftByClaim = emptyMap();
    }

    receive(msg: ClaimDrop) {
        if (msg.amount <= 0) {
            return;
        }
        if (!self.verifyClaim(msg)) {
            return;
        }
        if (self.isClaimed(msg.claimId)) {
            return;
        }

        self.markClaimed(msg.claimId);
        self.sendAsset(msg);
    }

    receive(msg: UpdateMerkleRoot) {
        if (sender() != self.owner) {
            return;
        }
        self.merkleRoot = msg.root;
    }

    receive(msg: RegisterNftForClaim) {
        if (sender() != self.owner) {
            return;
        }
        self.nftByClaim.set(msg.claimId, msg.nftItem);
    }

    receive(msg: UpdateDistributionEntry) {
        if (sender() != self.owner) {
            return;
        }
        self.distribution.set(msg.user, msg.amount);
    }

    get fun claimed(claimId: Int): Bool {
        return self.isClaimed(claimId);
    }

    get fun merkleRootValue(): Int {
        return self.merkleRoot;
    }
}
`;
}

async function main() {
  assertValid();
  const outDir = join(PROJECT_ROOT, 'contracts');
  const outFile = join(outDir, 'airdrop.generated.tact');
  await mkdir(outDir, { recursive: true });
  await writeFile(outFile, buildContractSource(), 'utf8');
  console.log(`Generated: ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
