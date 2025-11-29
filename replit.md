# Nekomancer - Monad dApp

## DEPLOYED TO MONAD MAINNET (Chain 143)

### SwapAggregatorV32 (UUPS Upgradeable) - LIVE ON MONAD ✅
- **Proxy (PERMANENT):** `0x6524822e437dcd23d62c77496d7a0ac980fbc81d`
- **Implementation (V32):** `0x19332B438Da14Ac5537d499d7e279f45C8A476c6`
- **Upgrade TX:** `0xa008e1b4b911e4438669a9201474756cc11247d69f61f7dbf617bb43ffb900cf`
- **Status:** LIVE on Monad Mainnet (Chain 143)
- **V32 NEW FEATURES:**
  1. **ReferralVault Integration:** Referral fees deposited to vault for claiming
  2. **Hardcoded Fee Split:** 30% Platform, 20% Referral (claimable), 50% Staking
  3. **New WithReferral Functions:** Pass referrer address directly
- **V32 New Functions:**
  - `swapMONForTokensWithReferral(tokenOut, minOut, deadline, v3Fee, referrer)` - Buy with referral
  - `swapTokensForMONWithReferral(tokenIn, amountIn, minOut, deadline, v3Fee, referrer)` - Sell with referral
  - `nadFunBuyWithReferral(token, minOut, deadline, v3Fee, referrer)` - Nad.Fun buy with referral
  - `nadFunSellWithReferral(token, amountIn, minOut, deadline, v3Fee, referrer)` - Nad.Fun sell with referral
  - `setReferralVault(address)` - Set ReferralVault address (owner only)
- **ReferralVault:** `0x28e123cfd53EA9B39BCec297eba161F0742764F2`

### ReferralVault V2 (UUPS Upgradeable) - LIVE ON MONAD ✅
- **Proxy (PERMANENT):** `0x28e123cfd53EA9B39BCec297eba161F0742764F2`
- **Implementation V2:** `0x141e636B8601e40c74f02b17114FB54A5030E706`
- **Status:** LIVE on Monad Mainnet (Chain 143)
- **V2 Features:**
  - **Minimum Claim:** $10 USD equivalent in MON (dynamic based on price)
  - Referrers can claim earnings anytime (above minimum)
  - Owner can emergency withdraw stuck funds
  - Tracks referral count per referrer
- **Functions:**
  - `claim()` - Claim all pending earnings (must be >= minClaimAmount)
  - `claimAmount(amount)` - Claim partial amount (must be >= minClaimAmount)
  - `getReferrerStats(referrer)` - Get pending, claimed, count
  - `minClaimAmount()` - Get current minimum in MON
  - `setMinClaimAmount(amount)` - Update minimum (owner only)
  - `emergencyWithdraw(to, amount)` - Owner rescue funds
  - `setDepositor(address, bool)` - Authorize depositors

### SwapAggregatorV31 (UUPS Upgradeable) - PREVIOUS
- **Implementation (V31):** `0x831Db236603F0b4c34c47aFc634782D6C5362C50`
- **V31 FIX:** DEX Router returns native MON, not WMON

### SwapAggregatorV30 (UUPS Upgradeable) - PREVIOUS
- **V30 FEATURES:** Multi-Hop Routing, Multi-Recipient Fee Distribution, Custom Fee Splits
- **API Endpoints:**
  - `POST /api/swap/pathfinder` - Find best direct route
  - `POST /api/swap/multihop` - Find best multi-hop route for token-to-token swaps

### SwapAggregatorV29 (UUPS Upgradeable) - PREVIOUS
- **Implementation (V29):** `0x640B7aB4753c5D4a02A0a84910d558BF60a5C770`
- **Features:** Fee Splitter - receives Nad.Fun referrer fees and splits 50/50
- **V29 Functions:** `distributeReferrerFees()`, `pendingReferrerFees()`, `receive() external payable`
- **Nad.Fun Router Calls (Direct from Frontend):**
  - Bonding Router: `0x6F6B8F1a20703309951a5127c45B49b1CD981A22` (unbonded tokens)
  - DEX Router: `0x0B79d71AE99528D1dB24A4148b5f4F865cc2b137` (graduated tokens)
  - Referrer: `0x6524822e437dcd23d62c77496d7a0ac980fbc81d` (aggregator = fee splitter)

### SwapAggregatorV27 (UUPS Upgradeable) - PREVIOUS
- **Implementation (V27):** `0xd923cC20883834B976509c283C9d32791fED17fB`
- **Upgrade TX:** `0xbe8ca6c6f16cf32fbc09af073f14a82884df283991c728387348d8f134683928`
- **Features:** Full V2, V3, Nad.Fun support with intelligent DEX Router vs V3 routing
- **V27 FIX - InvalidAmountOut:**
  1. Root cause: grossMin calculation was scaling UP minOut before passing to DEX Router
  2. If price dropped between quote and execution, grossMin > actual output → InvalidAmountOut
  3. FIX: Pass amountOutMin=1 to DEX Router, let swap execute at market price
  4. Slippage protection applied AFTER swap via minOut check in fee distribution
- **V26 Features (included):**
  1. DEX Router uses standard ERC20 approval (not Permit2)
  2. Correct routing for graduated Nad.Fun tokens
- **V21 Fixes (included):**
  1. DEX Router returns WMON, not MON - now unwrapping properly
  2. Tracks WMON balance before/after DEX Router call
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

## Deployment Timeline
- **November 28, 2025** - SwapAggregatorV4 & StakingVault (UUPS Upgradeable) deployed
- **November 29, 2025** - V28 Deployed with DEX Router Fallback + 1% Fee Collection
  - Implementation: `0x8567E426153CF3afEFb93D6E43cEB4b857ae78E2`
  - Proxy (Permanent): `0x6524822e437dcd23d62c77496d7a0ac980fbc81d`
  - **LIVE:** Graduated token sells now collect 1% platform fee via aggregator

## How to Sell Graduated Tokens (V28)
1. User approves aggregator for token amount
2. User calls `nadFunSell(token, amountIn, minOut, deadline)`
3. Aggregator automatically:
   - Checks V3 pool liquidity
   - Routes to DEX Router if better price
   - Deducts 1% platform fee
   - Sends remaining MON to user
4. **Result:** User gets ~99% in MON, Platform collects 1% fee
