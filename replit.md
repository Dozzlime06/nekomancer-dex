# Nekomancer - Monad dApp

## DEPLOYED TO MONAD MAINNET (Chain 143)

### SwapAggregatorV16 (UUPS Upgradeable) - LIVE ON MONAD ✅✅✅
- **Proxy (PERMANENT):** `0x6524822e437dcd23d62c77496d7a0ac980fbc81d`
- **Implementation (V16):** `0x603eD9DF4F10E70a9bFE2387B36d35bDf97e18e9` (Block 38,583,094)
- **Status:** Active on Monad Mainnet (Chain 143) - V3 MULTICALL FIX DEPLOYED
- **Features:** Full V2, V3, Nad.Fun support with split-route capability
- **V16 MAJOR FIX - Correct SwapRouter02 multicall pattern:**
  1. SwapRouter02 uses `multicall(deadline, bytes[])` - NOT deadline in struct
  2. ExactInputSingleParams has NO deadline field (SwapRouter02 format)
  3. All V3 swaps now use: `multicall(deadline, [exactInputSingle(...), unwrapWETH9(...)])`
  4. Token→MON uses `recipient: address(2)` (ADDRESS_THIS) then unwrapWETH9
- **Deployment Date:** Nov 28, 2025, 4:33 PM - V16 DEPLOYED
- **TESTED & CONFIRMED WORKING:**
  - ✅ MON→WETH V3: TX 0x52d341d2a56d12a4cc423cbbabfca13326c29717a9a7c5b2b886382516395fa0
  - ✅ WETH→MON V3: TX 0xbf5664dc9d45b0a817d69bf9e835c91b82b72cdef90a4b7e38deed1b24ddfb2c
  - ✅ Nad.Fun graduated token V3 swaps work
  - ✅ Approval + swap flow working correctly

### SwapAggregatorV10 (UUPS Upgradeable) - CURRENT
- **Proxy (PERMANENT):** `0x6524822e437dcd23d62c77496d7a0ac980fbc81d`
- **Implementation:** `0x887bd19892e9d2e2eb39d67c99d0da7b2946e254`
- **Status:** Live on Monad Mainnet (has multicall bug - V11 fixes it)
- **Features:**
  - Uniswap V2, PancakeSwap V2, **Uniswap V3** routing
  - **Nad.Fun integration** with smart pool detection
  - **SPLIT ROUTING** - trades can be split across multiple DEXes for best price
  - multiPathSwapMONForTokens() and multiPathSwapTokensForMON() functions
  - 1% fee split: 50% platform, 50% staking rewards
  - Platform: `0xE9059B5f1C60ecf9C1F07ac2bBa148A75394f56e`
  - UUPS upgradeable - address stays permanent
  - **V10 FIX:** Token → MON V3 swaps use multicall + unwrapWETH9 pattern (but multicall signature wrong)
  - **V10 BUG:** SwapRouter02 multicall(bytes[]) should be multicall(uint256, bytes[])

### SwapAggregatorV9 (UUPS Upgradeable) - Previous
- **Implementation:** `0x0aa0756f7a091c99e185077cf2002a3e5a6968ce`
- **V9 FIX:** Fixed _swapMONForTokensV3 to use passed v3Fee (was hardcoded to 3000)
- **V9 FIX:** Fixed _getBestRouter to revert when no V2 liquidity exists

### StakingVault (UUPS Upgradeable)
- **Proxy (PERMANENT):** `0x448317114cf3017fb8e2686c000b70c6a75735dc`
- **Implementation:** `0x5a232badd59963ddd5d2fcdbe93fd275c565dbb7`
- **Status:** Live on Monad Mainnet (awaiting MANCER token)
- **Features:**
  - Minimum stake: 100,000 tokens
  - Unstake delay: 3 days (request → wait → withdraw)
  - Emergency unstake: 20% burned to dead address, no rewards
  - Rewards: Auto-distributed from 50% of swap fees (MON)
  - UUPS upgradeable - can set MANCER token later via setStakingToken()

### Official DEX Router Addresses (Nov 28, 2025)
| DEX | Router Address | Type |
|-----|---|---|
| Uniswap V2 Router | 0x4B2ab38DBF28D31D467aA8993f6c2585981D6804 | V2 |
| Uniswap V3 SwapRouter02 | 0xfE31F71C1b106EAc32F1A19239c9a9A72ddfb900 | V3 |
| Uniswap V3 QuoterV2 | 0x661E93cca42AfacB172121EF892830cA3b70F08d | V3 |
| PancakeSwap V2 | 0xB1Bc24c34e88f7D43D5923034E3a14B24DaACfF9 | V2 |
| Nad.Fun LENS | 0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea | Query |
| Nad.Fun Bonding Router | 0x6F6B8F1a20703309951a5127c45B49b1CD981A22 | Trade |
| Nad.Fun DEX Router | 0x0B79d71AE99528D1dB24A4148b5f4F865cc2b137 | Trade |
| WMON | 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A | Wrapped |

### Smart Contracts (All Deployed)
1. **SwapAggregatorV4 Proxy** - `0x6524822e437dcd23d62c77496d7a0ac980fbc81d` (UUPS, 1% fee, 50/50 split)
2. **StakingVault Proxy** - `0x448317114cf3017fb8e2686c000b70c6a75735dc` (UUPS, 3-day lock, 20% burn)
3. **TokenLocker** - `0xc3b78fcf11623ab5705210d470bf2940714e9a40`
4. **TokenRegistry** - `0x4fd9b09eecec2aa6d69cd4411abcf1aa3bf2c70d`
5. **NadFunSwapProxyV2** - `0xa461a55b0e0c8cc2bb1039e93fbf1c298e571180`

### Deprecated Contracts (Old Addresses)
- SwapAggregatorV9 impl: `0x0aa0756f7a091c99e185077cf2002a3e5a6968ce`
- SwapAggregatorV8 impl: `0xa1a6f3fe7fe882831ae7cd5f0e27af01f0dcb39a`
- SwapAggregatorV7 impl: `0x3f82edeb94af67c2bd43072277a24eedb69b170f`
- SwapAggregatorV6 impl: `0x1ba08d25530b76f7e93971db1217226a5f4c55b0`
- SwapAggregatorV5 impl: `0xa9fc3d99fbac6e8befb4757f40faa9307b77998f`
- SwapAggregatorV4 impl: `0xa52f519802ecf1b2d9ed3ea8e29b8a2bc0cd58f9`
- SwapAggregatorV4 (non-upgradeable): `0x19e12fb08c3749c0a1a674ae607e35abfad0168e`
- SwapAggregatorV3: `0x930b96f20e3f967587ee97103f970b0ced3f6005`
- StakingVault (old): `0xb293c660aad0c33a0bfd41f6286157ef7271e118`

## Tech Stack
- Frontend: React + Tailwind + Framer Motion + Wouter
- Backend: Express + Viem
- Contracts: Solidity 0.8.24 (OpenZeppelin Upgradeable)
- Database: PostgreSQL
- Blockchain: Monad Mainnet (Chain 143)

## User Preferences
- Language: Tagalog/Filipino
- Data Source: On-chain only (Monad DEXes)
- DEXes: Uniswap, PancakeSwap, Nad.Fun
- No third-party APIs for pricing
- Cyber/Nekomancer theme with Creepster font for buttons

## Upgrade Instructions
To upgrade the contracts:
1. Deploy new implementation contract
2. Call `upgradeToAndCall(newImpl, data)` on proxy as owner
3. Proxy address stays the same

To set MANCER token:
```solidity
StakingVault(proxyAddress).setStakingToken(mancerTokenAddress);
```

## Deployment Date
November 28, 2025 - SwapAggregatorV4 & StakingVault (UUPS Upgradeable) deployed to Monad mainnet
V11 in development - fixes SwapRouter02 multicall interface issue
