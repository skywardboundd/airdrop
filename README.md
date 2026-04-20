# Airdrop Merkle-proof on TON

Модульная библиотека и набор смарт-контрактов для верифицируемого распределения токенов (airdrop) в блокчейне TON.

Контракт собирается из независимых модулей — proof-стратегия, тип ассета, защита от double-claim — что даёт матрицу из 12+ комбинаций.

## Установка

```bash
npm install
```

## Архитектура

```
contracts/
  messages.tact              # ClaimDrop, UpdateMerkleRoot, ...
  proof/
    trait.tact               # abstract verifyClaim
    merkle.tact              # MerkleProof  — exotic cell + DICTUGET
    signing.tact             # SignatureProof — Ed25519 (CHKSIGNS)
    particia.tact            # PatriciaProof — on-chain distribution map
  asset/
    trait.tact               # abstract sendAsset
    jetton.tact              # Jetton (TEP-74)
    nft.tact                 # NFT (TEP-62)
    native.tact              # NativeTon — отправка TON-коинов
    sbt.tact                 # Пример кастомного ассета (Soulbound Token)
  double-claim/
    map.tact                 # MapDoubleClaim — chunked bitmap (LDSLICEX)
    markers.tact             # MarkerDoubleClaim — отдельный контракт на claim

src/
  types.ts                   # Discriminated unions: ProofModule, AssetModule, ...
  sdk.ts                     # AirdropSDK<P> — generic класс, proof builders
  facade.ts                  # Прокси-функции по API из РП
  generateMerkleProof.ts     # Pruned dict merkle proof (LDSLICEX)
  merkle.ts                  # Off-chain binary merkle tree
  proofStrategies.ts         # Off-chain верификация
  doubleClaim.ts             # Off-chain double-claim stores
  index.ts                   # Публичный re-export

examples/
  usage.ts                   # Примеры всех трёх proof-стратегий
```

## Модули

### Proof (верификация claim)

| Модуль | Хранение | Газ | Описание |
|--------|----------|-----|----------|
| `MerkleProof` | 32 байта (root) | +1289% | Exotic cell, ASM-парсинг, trustless |
| `SignatureProof` | 32 байта (pubkey) | +80% | Ed25519, фиксированный proof 64 байта |
| `PatriciaProof` | O(N) on-chain | baseline | Lookup в словаре, без off-chain инфраструктуры |

### Asset (отправка ассета)

| Модуль | Описание |
|--------|----------|
| `Jetton` | Перевод жеттонов (TEP-74 JettonTransfer) |
| `NFT` | Перевод NFT (TEP-62 NftTransfer) |
| `NativeTon` | Отправка нативных TON |
| `custom` | Пользовательский trait (см. [Кастомный ассет](#кастомный-ассет)) |

### Double-claim (защита от повторного клейма)

| Модуль | Ёмкость | Описание |
|--------|---------|----------|
| `MapDoubleClaim` | ~44.7M claims | Chunked bitmap: 1023 бита/cell, LDSLICEX |
| `MarkerDoubleClaim` | неограничено | Отдельный Marker-контракт на claim |

## Генерация контракта

```bash
# Встроенные модули
AIRDROP_PROOF=merkle AIRDROP_ASSET=jetton AIRDROP_DOUBLE_CLAIM=map \
  npm run build:airdrop-temp

# Кастомный ассет
AIRDROP_PROOF=signing \
  AIRDROP_ASSET=custom \
  AIRDROP_ASSET_IMPORT=asset/sbt \
  AIRDROP_ASSET_TRAIT=SbtAsset \
  AIRDROP_DOUBLE_CLAIM=markers \
  npm run build:airdrop-temp
```

Результат: `contracts/airdrop.generated.tact`

### Переменные окружения

| Переменная | Значения | По умолчанию |
|------------|----------|--------------|
| `AIRDROP_PROOF` | `merkle`, `signing`, `particia` | `merkle` |
| `AIRDROP_ASSET` | `jetton`, `nft`, `native_ton`, `custom` | `jetton` |
| `AIRDROP_DOUBLE_CLAIM` | `map`, `markers` | `map` |
| `AIRDROP_ASSET_IMPORT` | путь к .tact файлу (для `custom`) | — |
| `AIRDROP_ASSET_TRAIT` | имя Tact trait (для `custom`) | — |

## Компиляция всех комбинаций

```bash
npm run compile:matrix
```

## Кастомный ассет

Чтобы раздать нестандартный ассет (SBT, ваучеры, кастомный TEP и т.д.):

### 1. Написать Tact trait

Создайте файл в `contracts/asset/`, реализующий `fun sendAsset(msg: ClaimDrop)`:

```tact
// contracts/asset/my-voucher.tact
import "../messages";

message(0xdeadbeef) VoucherMint {
    queryId: Int as uint64;
    recipient: Address;
    amount: Int as coins;
}

trait VoucherAsset {
    jettonWallet: Address;

    fun sendAsset(msg: ClaimDrop) {
        send(SendParameters{
            to: self.jettonWallet,
            value: msg.amount,
            mode: SendPayGasSeparately,
            body: VoucherMint{
                queryId: msg.claimId,
                recipient: msg.recipient,
                amount: msg.amount
            }.toCell()
        });
    }
}
```

Trait должен:
- Реализовать `fun sendAsset(msg: ClaimDrop)`
- Использовать поля контракта (`jettonWallet`, `owner` и т.д.) для адресации
- Вызвать `send(SendParameters{...})` с нужным `body`

### 2. Сгенерировать контракт

```bash
AIRDROP_ASSET=custom \
  AIRDROP_ASSET_IMPORT=asset/my-voucher \
  AIRDROP_ASSET_TRAIT=VoucherAsset \
  npm run build:airdrop-temp
```

### 3. Использовать в SDK

```typescript
import { AirdropSDK, type OnChainClaim } from './src/index.js';
import { beginCell, Address } from '@ton/core';

const sdk = AirdropSDK.create({
  proof: { kind: 'merkle', claims: [...] },
  asset: {
    kind: 'custom',
    tactTrait: 'VoucherAsset',
    tactImport: 'asset/my-voucher',
    assetAddress: Address.parse('EQ...voucher_collection'),
    buildSendBody: (claim: OnChainClaim) =>
      beginCell()
        .storeUint(0xdeadbeef, 32)
        .storeUint(claim.claimId, 64)
        .storeAddress(claim.recipient)
        .storeCoins(claim.amount)
        .endCell(),
  },
  doubleClaim: { kind: 'map' },
  owner: Address.parse('EQ...owner'),
});

console.log(sdk.variant); // "merkle.custom.map"
```

Встроенные примеры: `contracts/asset/sbt.tact` (Soulbound Token).

## Библиотека (TypeScript SDK)

### Основной API

```typescript
import { AirdropSDK } from './src/index.js';
import { Address, toNano } from '@ton/core';
import { keyPairFromSeed } from '@ton/crypto';

// ── Создание SDK ───────────────────────────────────────
const keyPair = keyPairFromSeed(seed);

const sdk = AirdropSDK.create({
  proof: { kind: 'signing', secretKey: keyPair.secretKey, publicKey: keyPair.publicKey },
  asset: { kind: 'jetton', jettonWallet: Address.parse('EQ...') },
  doubleClaim: { kind: 'map' },
  owner: Address.parse('EQ...'),
});

// ── Variant key (для выбора скомпилированного контракта) ──
sdk.variant; // "signing.jetton.map"

// ── Init params для деплоя ─────────────────────────────
const { owner, merkleRoot, publicKey, jettonWallet, distribution } = sdk.initParams;

// ── Подготовка claim-транзакции ────────────────────────
const { body, proofCell } = sdk.prepareClaim({
  claim: { claimId: 1n, recipient: Address.parse('EQ...'), amount: toNano('100') },
});

// ── Адрес для отправки ─────────────────────────────────
const target = sdk.claimTarget(airdropAddress, claimId);
```

### Merkle-дерево (facade API)

```typescript
import {
  buildMerkleTreeFromRecipients,
  getMerkleProof,
  verifyMerkleProofExotic,
  getAllMerkleProofs,
} from './src/index.js';

// Построение
const recipients = new Map([[Address.parse('EQ...'), toNano('1')]]);
const { dict, root } = buildMerkleTreeFromRecipients(recipients);

// Proof для одного claim
const proof = getMerkleProof({ dict, root }, 0n);

// Batch — все proofs за один обход
const allProofs = getAllMerkleProofs({ dict, root });

// Off-chain верификация
const valid = verifyMerkleProofExotic(root, proof, 0n, addr, toNano('1'));
```

### Patricia-дерево (off-chain)

```typescript
import {
  buildPatriciaTree,
  getPatriciaProof,
  verifyPatriciaProof,
  updatePatriciaTree,
  deleteFromPatriciaTree,
} from './src/index.js';

// Построение
const tree = buildPatriciaTree(new Map([[addr, toNano('5')]]));

// Proof + верификация
const proof = getPatriciaProof(tree, addr);
const ok = verifyPatriciaProof(tree.root, proof, addr, toNano('5'));

// Обновление (возвращает новое дерево)
const updated = updatePatriciaTree(tree, addr, toNano('10'));
const deleted = deleteFromPatriciaTree(tree, addr);
```

## Тестирование

```bash
# Unit-тесты библиотеки
npm test

# Sandbox e2e (деплой + claim + double-claim)
npx vitest run tests/sandboxE2E.spec.ts

# Sandbox trait-тесты
npx vitest run tests/sandboxTraits.spec.ts
```

## Бенчмарки

```bash
npm run bench
```

Артефакты: `bench-results/{results.json, results.csv, gas-like-report.md}`

### Сравнительные затраты

**Proof-модули** (vs PatriciaProof baseline):

| Модуль | Среднее время | Характеристика |
|--------|---------------|----------------|
| PatriciaProof | +0% | on-chain словарь, lookup O(log N) |
| SignatureProof | +80% | Ed25519, фиксированный proof |
| MerkleProof | +1289% | exotic cell, ASM-парсинг |

**Double-claim модули** (vs MapDoubleClaim baseline):

| Модуль | Среднее время | Характеристика |
|--------|---------------|----------------|
| MapDoubleClaim | +0% | chunked bitmap в основном контракте |
| MarkerDoubleClaim | +54% | отдельный контракт на пользователя |

### Практические ограничения

| Модуль | Параметр | Ограничение |
|--------|----------|-------------|
| MapDoubleClaim | claims | ~44.7M (chunked bitmap, 1023 бита/cell) |
| MerkleProof | глубина | 64 уровня; списки до 2^64 элементов |
| MarkerDoubleClaim | claims на маркер | 1 |
| PatriciaProof | записей | ~3000 (размер внешних сообщений TON) |

### Рекомендации по выбору

- **Небольшой/средний список**: `PatriciaProof + MapDoubleClaim` — простота, минимальные runtime-затраты
- **Большой список, компактный state**: `MerkleProof + MarkerDoubleClaim`
- **Редактируемая on-chain таблица**: `PatriciaProof + MapDoubleClaim` с инкрементальным обновлением

## Контракт: getters

После деплоя контракт предоставляет getter-ы:

- `claimed(claimId: Int): Bool` — проверка статуса клейма
- `merkleRootValue(): Int` — текущий merkle root

## Лицензия

MIT
