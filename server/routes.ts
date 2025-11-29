import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { createPublicClient, http, parseAbi, getAddress, createWalletClient, encodeFunctionData, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getAllSwapQuotes, getWMONPriceUSD } from "./swap";
import { findBestPath, isNadFunToken, findMultiHopPath, findBestTokenToTokenPath } from "./pathfinder";
import { 
  recordSwapToSheet, 
  recordStakeToSheet, 
  getSwapLeaderboard, 
  getStakingLeaderboard,
  getSwapStats,
  getStakingStats,
  getOrCreateSpreadsheet
} from "./googleSheets";
import { getUncachableGitHubClient } from "./github";

// ERC20 ABI for balanceOf, decimals, name, and symbol
const ERC20_ABI = parseAbi([
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function name() external view returns (string)',
  'function symbol() external view returns (string)',
]);

// Token Registry ABI - simplified for viem compatibility
const TOKEN_REGISTRY_ABI = parseAbi([
  'function registerToken(address tokenAddress, string symbol, string name, uint8 decimals, string logoURI) external',
  'function getTokenCount() external view returns (uint256)',
]) as any;

// DEX Pair ABIs for on-chain price queries (Uniswap V2 compatible)
const PAIR_ABI = parseAbi([
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function totalSupply() external view returns (uint256)',
]);

// Uniswap V2 Router ABI for getting amounts
const UNISWAP_V2_ROUTER_ABI = parseAbi([
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
  'function WETH() external pure returns (address)',
]) as any;

// Uniswap V3 Quoter ABI for price quotes
const UNISWAP_V3_QUOTER_ABI = parseAbi([
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
]) as any;

// SwapAggregator ABI - with factory-based path detection
const REAL_SWAP_AGGREGATOR_ABI = parseAbi([
  'function getBestQuote(address tokenIn, address tokenOut, uint256 amountIn) public view returns (string memory bestDex, uint256 bestAmount, address[] memory bestPath)',
  'function getAllQuotes(address tokenIn, address tokenOut, uint256 amountIn) external view returns (string[] memory dexNames, uint256[] memory amounts, address[][] memory paths)',
]) as any;

// SwapAggregator ABI
const SWAP_AGGREGATOR_ABI = parseAbi([
  'function getBestQuote(address tokenIn, address tokenOut, uint256 amountIn) external view returns (string memory bestDex, uint256 bestAmount)',
]) as any;

// Nad.Fun Token ABI - for querying tokenURI on individual token contracts
const NAD_FUN_TOKEN_ABI = parseAbi([
  'function tokenURI() external view returns (string memory)',
  'function name() external view returns (string memory)',
  'function symbol() external view returns (string memory)',
]) as any;

// Nad.Fun Lens for checking if token is a Nad.Fun token
const NAD_FUN_LENS = '0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea';
const NAD_FUN_LENS_ABI = parseAbi([
  'function isGraduated(address _token) external view returns (bool)',
  'function isLocked(address _token) external view returns (bool)',
]) as any;

// Known Monad DEX Pair Contracts to query for token discovery
// Format: { pairAddress, dex }
// Mainnet pairs from DexScreener (Nov 27, 2025)
const MONAD_DEX_PAIRS: { pairAddress: string; dex: string }[] = [
  { pairAddress: '0x659bd0bc4167ba25c62e05656f78043e7ed4a9da', dex: 'uniswap' }, // MON/USDC (v3)
  { pairAddress: '0x25ef1a210ff55bcee9f8fee979aaff6bd1be5bf1', dex: 'uniswap' }, // WETH/USDC (v3)
  { pairAddress: '0x0a9d7fcfccd4b457fc9ef613d319cfdbef61ef3e', dex: 'uniswap' }, // MONK/WMON (v3)
  { pairAddress: '0xfc1aa47680316f9c5d1b4545dabce3525aba72a3', dex: 'uniswap' }, // DUKO/WMON (v2)
  { pairAddress: '0x24b18eb6be3994e5a4484bce60af76cf60733301', dex: 'uniswap' }, // UNIT/WMON (v3)
  { pairAddress: '0x30110228b59b21fafe8675ed930983e2f272b74c', dex: 'uniswap' }, // ANAGO/WMON (v3)
  { pairAddress: '0x745355f47db8c57e7911ef3da2e989b16039d12f', dex: 'uniswap' }, // CHOG/WMON (v3)
  { pairAddress: '0xf0825f9315ccb86aca7d7cc23f6c092b09a88aba', dex: 'uniswap' }, // CHOG/USDC (v3)
  { pairAddress: '0xd0fc96ff1275702cdc9b3d1efe4558bf3c35c988', dex: 'uniswap' }, // GMONAD/USDC (v3)
  { pairAddress: '0xce8f9cd0df2078a4aed416924872cb2235fa1b60', dex: 'uniswap' }, // GMONAD/WMON (v3)
  { pairAddress: '0x8c6f3c054b18f4a99217f361029f1502178b87f1', dex: 'uniswap' }, // BOTS/WMON (v3)
  { pairAddress: '0x5f1159c13248ae0d685c8915372751d70049456b', dex: 'uniswap' }, // UNIT/USDC (v3)
  { pairAddress: '0x1f86a9f2441cac9b942cfb5445530cdbb28717ed', dex: 'uniswap' }, // shMON/WMON (v3)
  // Add USDT pairs for stablecoin support
  { pairAddress: '0x550142f8539a684e479a0d2521f670bda523f38d', dex: 'uniswap' }, // USDT/USDC (from earlier search)
];

// Pre-seeded token list - VERIFIED from DexScreener Nov 28, 2025
// Prices are fetched REAL-TIME from on-chain DEX pools (Uniswap V3/V2, Nad.Fun)
// price: 0 means fetch from chain - no hardcoded prices!
const KNOWN_TOKENS: any[] = [
  // Native & Wrapped - VERIFIED
  { address: '0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE', symbol: 'MON', name: 'Monad', decimals: 18, logo: 'https://dd.dexscreener.com/ds-data/tokens/monad/0x3bd359c1119da7da1d913d1c4d2b7c461115433a.png', price: 0, source: 'native' },
  { address: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', symbol: 'WMON', name: 'Wrapped MON', decimals: 18, logo: 'https://dd.dexscreener.com/ds-data/tokens/monad/0x3bd359c1119da7da1d913d1c4d2b7c461115433a.png', price: 0 },
  // Stablecoins - VERIFIED from DexScreener pairs
  { address: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', symbol: 'USDC', name: 'USDC', decimals: 6, logo: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png', price: 1 },
  { address: '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18, logo: 'https://assets.coingecko.com/coins/images/2518/small/weth.png', price: 0 },
  // Top Tokens - VERIFIED from DexScreener Uniswap/Nad.fun pairs
  { address: '0x350035555E10d9AfAF1566AaebfCeD5BA6C27777', symbol: 'CHOG', name: 'Chog', decimals: 18, logo: 'https://dd.dexscreener.com/ds-data/tokens/monad/0x350035555e10d9afaf1566aaebfced5ba6c27777.png', price: 0 },
  { address: '0x788571E0E5067Adea87e6BA22a2b738fFDf48888', symbol: 'UNIT', name: 'UNIT', decimals: 18, logo: 'https://dd.dexscreener.com/ds-data/tokens/monad/0x788571e0e5067adea87e6ba22a2b738ffdf48888.png', price: 0 },
  { address: '0x99aE2DC76c43979E3BcC0ae8d69F1fca077c8888', symbol: 'ANAGO', name: 'Anago', decimals: 18, logo: 'https://dd.dexscreener.com/ds-data/tokens/monad/0x99ae2dc76c43979e3bcc0ae8d69f1fca077c8888.png', price: 0 },
  { address: '0x1f80C65cC2c37Af84ABbe1ea03183A624a6F8888', symbol: 'GMONAD', name: 'Gmonad', decimals: 18, logo: 'https://dd.dexscreener.com/ds-data/tokens/monad/0x1f80c65cc2c37af84abbe1ea03183a624a6f8888.png', price: 0 },
  { address: '0x4bEdf5d792DAb4BfeF048d86af4404228DF3F3fb', symbol: 'BOTS', name: 'Mobots', decimals: 18, logo: 'https://dd.dexscreener.com/ds-data/tokens/monad/0x4bedf5d792dab4bfef048d86af4404228df3f3fb.png', price: 0 },
  { address: '0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c', symbol: 'SHMON', name: 'ShMonad', decimals: 18, logo: 'https://www.fastlane.xyz/branding-page/shmonad/png/SHMONAD_ICON.png', price: 0 },
  { address: '0x441a941B925FBFD5e33b5a820FFcC21D196faA76', symbol: 'MONK', name: 'Monk The Monkey King', decimals: 18, logo: 'https://dd.dexscreener.com/ds-data/tokens/monad/0x441a941b925fbfd5e33b5a820ffcc21d196faa76.png', price: 0 },
  { address: '0x1361d007E8f6aBDd7a873f413513A381AeFed404', symbol: 'DUKO', name: 'MONAD DUKO', decimals: 18, logo: 'https://dd.dexscreener.com/ds-data/tokens/monad/0x1361d007e8f6abdd7a873f413513a381aefed404.png', price: 0 },
  // Nad.Fun Tokens - VERIFIED from DexScreener
  { address: '0x87deEb3696Ec069d5460C389cc78925df50d7777', symbol: 'IDGAF', name: 'IDGAF', decimals: 18, logo: 'https://cdn.dexscreener.com/cms/images/cf30e4dde22a51edafcd6d4f5098433d5f00f9d963bd554d2bdcfe77cf35637b', price: 0 },
  { address: '0xA7b3F394B9AAbA67f2543a8c1A0F753cC68d7777', symbol: 'GONAD', name: 'GONAD', decimals: 18, logo: 'https://cdn.dexscreener.com/cms/images/fc4f1b58caeb78943d8abd932f3a155ee6c938fbff008af0e46931900560e924', price: 0 },
  { address: '0xc911Ba7aEE487f5145702c20c20a40d9e5B87777', symbol: 'HOGDOG', name: 'Hog Dog', decimals: 18, logo: 'https://cdn.dexscreener.com/cms/images/3e4932ef50030f4c9097fcbf7fbb649e06457b81b52c2b29a51b9baa608d8617', price: 0 },
];

// Token cache - initialized with known tokens so list is always complete
let tokenCache: any[] = [...KNOWN_TOKENS];
let lastCacheUpdate = 0;
const CACHE_DURATION = 30000; // 30 seconds - refresh token list frequently
let tokenFetchInProgress = false; // Prevent concurrent fetch race conditions

// Price cache for all tokens
let wmonPriceCache = 0;
let wmonPriceCacheTime = 0;
const WMON_CACHE_DURATION = 15000; // 15 seconds - WMON price updates frequently

// Token price cache with TTL
let priceCache = new Map<string, { price: number; time: number }>();
const PRICE_CACHE_DURATION = 15000; // 15 seconds - faster price updates

// Throttle helper - reduced for faster fetching
async function throttle(ms: number = 20): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Known token decimals to avoid RPC calls
const KNOWN_DECIMALS: Record<string, number> = {
  '0x3bd359c1119da7da1d913d1c4d2b7c461115433a': 18, // WMON
  '0x754704bc059f8c67012fed69bc8a327a5aafb603': 6,  // USDC
  '0xee8c0e9f1bffb4eb878d8f15f368a02a35481242': 18, // WETH
  '0x98cba48cfb0573e1635ae00d8b3b43b4fad844d6': 6,  // USDT
  '0x1b68626dca36c7fe922fd2d55e4f631d962de19c': 18, // shMON
};

const getKnownDecimals = (addr: string): number | undefined => {
  return KNOWN_DECIMALS[addr.toLowerCase()];
};

// Chain RPC URLs
const RPC_URLS: Record<number, string> = {
  143: 'https://rpc3.monad.xyz/', // Monad
  41454: 'https://testnet-rpc.monad.xyz/', // Monad Testnet
  41455: 'https://rpc3.monad.xyz/', // Monad Mainnet (use rpc3)
  1: 'https://eth.public.nownodes.io/', // Ethereum
  137: 'https://polygon-rpc.com/', // Polygon
};

// Discover tokens from DEX pairs on-chain - optimized for speed
async function discoverTokensFromPairs(chainId: number): Promise<Map<string, any>> {
  const tokenMap = new Map<string, any>();
  const rpcUrl = RPC_URLS[chainId] || RPC_URLS[143];
  const client = createPublicClient({
    transport: http(rpcUrl),
  });

  console.log(`[TOKEN_DISCOVERY] Discovering tokens from ${MONAD_DEX_PAIRS.length} known pairs`);

  // Query pairs with minimal throttling (batch by 3-4 at a time)
  const allTokenAddrs = new Set<string>();
  const batchSize = 4;
  
  for (let i = 0; i < MONAD_DEX_PAIRS.length; i += batchSize) {
    const batch = MONAD_DEX_PAIRS.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (pair) => {
        try {
          const [token0Addr, token1Addr] = await Promise.all([
            client.readContract({
              address: pair.pairAddress as `0x${string}`,
              abi: PAIR_ABI,
              functionName: 'token0',
            }) as Promise<string>,
            client.readContract({
              address: pair.pairAddress as `0x${string}`,
              abi: PAIR_ABI,
              functionName: 'token1',
            }) as Promise<string>,
          ]);
          allTokenAddrs.add(token0Addr.toLowerCase());
          allTokenAddrs.add(token1Addr.toLowerCase());
        } catch (error) {
          // Continue silently
        }
      })
    );
    await throttle(30); // Minimal throttle between batches
  }

  // Fetch metadata for all unique tokens in parallel
  const metadataResults = await Promise.all(
    Array.from(allTokenAddrs).map(addr => fetchTokenMetadata(addr, chainId).catch(() => null))
  );

  for (const metadata of metadataResults) {
    if (metadata) {
      tokenMap.set(metadata.address.toLowerCase(), metadata);
      console.log(`[TOKEN_DISCOVERY] Found: ${metadata.symbol}`);
    }
  }

  // Set initial prices and add logos (async)
  const logoPromises = Array.from(tokenMap.values()).map(async (token) => {
    token.price = 0;
    token.logo = await fetchTokenLogo(token.symbol, token.address, chainId);
  });
  await Promise.all(logoPromises);

  return tokenMap;
}

// Fetch token logo from all available on-chain and CDN sources
async function fetchTokenLogo(symbolOrAddress: string, tokenAddr?: string, chainId: number = 143): Promise<string> {
  const sym = symbolOrAddress.toUpperCase();
  const addr = (tokenAddr || symbolOrAddress).toLowerCase();

  // Well-known tokens with reliable logo sources
  const wellKnownLogos: Record<string, string> = {
    'MON': 'https://dd.dexscreener.com/ds-data/tokens/monad/0x3bd359c1119da7da1d913d1c4d2b7c461115433a.png',
    'WMON': 'https://dd.dexscreener.com/ds-data/tokens/monad/0x3bd359c1119da7da1d913d1c4d2b7c461115433a.png',
    'USDC': 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
    'USDT': 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
    'WETH': 'https://assets.coingecko.com/coins/images/2518/small/weth.png',
    'ETH': 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
    'SHMON': 'https://www.fastlane.xyz/branding-page/shmonad/png/SHMONAD_ICON.png',
  };

  // Native MON token
  if (sym === 'MON' || addr === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
    return wellKnownLogos['MON'];
  }

  // Check well-known logos first
  if (wellKnownLogos[sym]) {
    return wellKnownLogos[sym];
  }

  // DexScreener CDN by address (for tokens with same symbol but different addresses)
  // Use address-based lookup instead of symbol to avoid logo conflicts
  
  // For any token by address - use DexScreener CDN
  if (addr.startsWith('0x') && addr.length === 42) {
    return `https://dd.dexscreener.com/ds-data/tokens/monad/${addr}.png`;
  }

  // Try tokenURI() on the token contract itself (Nad.Fun tokens have this)
  if (addr.startsWith('0x') && addr.length === 42) {
    try {
      const rpcUrl = RPC_URLS[chainId] || RPC_URLS[143];
      const client = createPublicClient({ transport: http(rpcUrl) });
      
      // Call tokenURI() directly on the token contract (not factory)
      const tokenURIResult = await Promise.race([
        client.readContract({
          address: addr as `0x${string}`,
          abi: NAD_FUN_TOKEN_ABI,
          functionName: 'tokenURI',
          args: [],
        }),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
      ]);
      
      if (typeof tokenURIResult === 'string' && tokenURIResult.length > 0) {
        // tokenURI can be a direct URL or JSON metadata
        if (tokenURIResult.startsWith('http://') || tokenURIResult.startsWith('https://')) {
          // It might be a JSON metadata URL, try to fetch and parse
          try {
            const metadataResponse = await fetch(tokenURIResult, { signal: AbortSignal.timeout(2000) });
            if (metadataResponse.ok) {
              const metadata = await metadataResponse.json();
              if (metadata.image) {
                console.log(`[LOGO] Found Nad.Fun logo for ${addr}: ${metadata.image}`);
                return metadata.image;
              }
            }
          } catch {
            // If it's not JSON, use the URL directly
            console.log(`[LOGO] Using tokenURI directly for ${addr}: ${tokenURIResult}`);
            return tokenURIResult;
          }
        } else if (tokenURIResult.startsWith('data:application/json')) {
          // Base64 encoded JSON
          try {
            const base64Data = tokenURIResult.split(',')[1];
            const jsonStr = Buffer.from(base64Data, 'base64').toString();
            const metadata = JSON.parse(jsonStr);
            if (metadata.image) {
              console.log(`[LOGO] Found base64 Nad.Fun logo for ${addr}: ${metadata.image}`);
              return metadata.image;
            }
          } catch {}
        }
      }
    } catch (e) {
      // Not a Nad.Fun token or tokenURI not available, continue to other sources
    }
  }

  // Try Trust Wallet address format for address-based lookup (new tokens)
  if (addr.startsWith('0x')) {
    try {
      const trustUrl = `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/monad/assets/${addr}/logo.png`;
      const response = await fetch(trustUrl, { signal: AbortSignal.timeout(1500) }).catch(() => null);
      if (response?.ok) {
        console.log(`[LOGO] Found Trust Wallet logo for ${addr}`);
        return trustUrl;
      }
    } catch (e) {
      // Continue
    }
  }

  // Try DexScreener CDN (most comprehensive for new tokens)
  if (addr.startsWith('0x')) {
    const dexUrl = `https://dd.dexscreener.com/ds-data/tokens/monad/${addr.toLowerCase()}.png`;
    console.log(`[LOGO] Using DexScreener fallback for ${addr}`);
    return dexUrl;
  }

  // Last resort: Monad official logo
  console.log(`[LOGO] Using Monad default logo for ${addr}`);
  return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/monad/info/logo.png`;
}

// Fetch token price ONLY from DEX pools (on-chain)
async function fetchTokenPrice(symbol: string, tokenAddress?: string, chainId: number = 143): Promise<number> {
  try {
    if (!tokenAddress) {
      return 0;
    }
    
    // Native MON = WMON price
    if (tokenAddress === '0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE') {
      const wmonPrice = await getWmonPrice(chainId);
      console.log(`[PRICE] MON = $${wmonPrice.toFixed(4)} (same as WMON)`);
      return wmonPrice;
    }

    const pricePromise = getPriceFromDexPools(tokenAddress, chainId);
    const timeoutPromise = new Promise<number>((_r, reject) => 
      setTimeout(() => reject(new Error('timeout')), 10000)
    );
    
    const price = await Promise.race([pricePromise, timeoutPromise]);
    return Math.max(0, price); // Return actual price or 0
  } catch (error) {
    return 0; // Return 0 if price fetching fails
  }
}

// Get token decimals with known tokens cache
async function getTokenDecimals(tokenAddress: string, chainId: number, defaultDecimals: number = 18): Promise<number> {
  // Check known decimals first to avoid RPC call
  const known = getKnownDecimals(tokenAddress);
  if (known !== undefined) return known;
  
  try {
    const rpcUrl = RPC_URLS[chainId] || RPC_URLS[143];
    const client = createPublicClient({ transport: http(rpcUrl) });
    const decimals = await client.readContract({
      address: tokenAddress as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'decimals',
    }) as number;
    return decimals || defaultDecimals;
  } catch (e) {
    return defaultDecimals;
  }
}

// Get WMON price from on-chain DEX using V3 Quoter and V2 Router
async function getWmonPrice(chainId: number): Promise<number> {
  // Return cached price if still fresh
  if (wmonPriceCache > 0 && (Date.now() - wmonPriceCacheTime) < WMON_CACHE_DURATION) {
    return wmonPriceCache;
  }

  const usdcAddress = '0x754704Bc059F8C67012fEd69BC8A327a5aafb603';
  const wmonAddress = '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A';
  const uniswapV3Quoter = '0x661E93cca42AfacB172121EF892830cA3b70F08d';
  const uniswapV2Router = '0x4B2ab38DBF28D31D467aA8993f6c2585981D6804';
  
  const rpcUrl = RPC_URLS[chainId] || RPC_URLS[143];
  const client = createPublicClient({ transport: http(rpcUrl) });
  const oneWmon = 10n ** 18n;

  // === Try V3 Quoter first (most liquidity) ===
  const v3Fees = [500, 3000, 10000];
  for (const fee of v3Fees) {
    try {
      const quoteResult = await client.readContract({
        address: uniswapV3Quoter as `0x${string}`,
        abi: UNISWAP_V3_QUOTER_ABI,
        functionName: 'quoteExactInputSingle',
        args: [{ tokenIn: wmonAddress, tokenOut: usdcAddress, amountIn: oneWmon, fee, sqrtPriceLimitX96: 0n }],
      }) as [bigint, bigint, number, bigint];
      const amountOut = quoteResult[0];
      
      if (amountOut > 0n) {
        const price = Number(amountOut) / 1e6; // USDC has 6 decimals
        wmonPriceCache = price;
        wmonPriceCacheTime = Date.now();
        console.log(`[PRICE_WMON] WMON = $${price.toFixed(4)} via V3`);
        return price;
      }
    } catch {}
  }

  // === Try V2 Router ===
  try {
    const path = [wmonAddress as `0x${string}`, usdcAddress as `0x${string}`];
    const amounts = await client.readContract({
      address: uniswapV2Router as `0x${string}`,
      abi: UNISWAP_V2_ROUTER_ABI,
      functionName: 'getAmountsOut',
      args: [oneWmon, path],
    }) as bigint[];
    
    if (amounts && amounts.length >= 2 && amounts[1] > 0n) {
      const price = Number(amounts[1]) / 1e6;
      wmonPriceCache = price;
      wmonPriceCacheTime = Date.now();
      console.log(`[PRICE_WMON] WMON = $${price.toFixed(4)} via V2`);
      return price;
    }
  } catch {}

  return 0;
}


// Get token price from ALL DEX sources: V2 Routers, V3 Quoter, Nad.Fun LENS
async function getPriceFromDexPools(tokenAddress: string, chainId: number): Promise<number> {
  const tokenLower = tokenAddress.toLowerCase();
  const cacheKey = `${tokenLower}-${chainId}`;
  
  // Check cache first
  const cached = priceCache.get(cacheKey);
  if (cached && Date.now() - cached.time < PRICE_CACHE_DURATION) {
    return cached.price;
  }
  
  try {
    const rpcUrl = RPC_URLS[chainId] || RPC_URLS[143];
    const client = createPublicClient({ transport: http(rpcUrl) });
    const usdcAddress = '0x754704Bc059F8C67012fEd69BC8A327a5aafb603';
    const wmonAddress = '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A';
    const uniswapV2Router = '0x4B2ab38DBF28D31D467aA8993f6c2585981D6804';
    const pancakeV2Router = '0xB1Bc24c34e88f7D43D5923034E3a14B24DaACfF9';
    const uniswapV3Quoter = '0x661E93cca42AfacB172121EF892830cA3b70F08d';
    const nadfunLens = '0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea';
    
    // If USDC, return $1
    if (tokenLower === usdcAddress.toLowerCase()) {
      priceCache.set(cacheKey, { price: 1.0, time: Date.now() });
      return 1.0;
    }
    
    // If WMON or native MON (0xEEEE...), get price from WMON/USDC pair
    const nativeMonAddress = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    if (tokenLower === wmonAddress.toLowerCase() || tokenLower === nativeMonAddress) {
      const wmonPrice = await getWmonPrice(chainId);
      priceCache.set(cacheKey, { price: wmonPrice, time: Date.now() });
      return wmonPrice;
    }
    
    const oneToken = 10n ** 18n; // 1 token with 18 decimals
    const v3FeeTiers = [100, 500, 3000, 10000]; // Include 0.01% fee tier
    
    // Try all price sources in parallel for speed
    const pricePromises: Promise<{ price: number; source: string }>[] = [];
    
    // V2 Uniswap - direct TOKEN -> USDC
    pricePromises.push(
      client.readContract({
        address: uniswapV2Router as `0x${string}`,
        abi: UNISWAP_V2_ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: [oneToken, [tokenAddress, usdcAddress]],
      }).then((amounts: any) => {
        const price = amounts?.[1] > 0n ? Number(amounts[1]) / 1e6 : 0;
        return { price, source: 'V2-direct' };
      }).catch(() => ({ price: 0, source: '' }))
    );
    
    // V2 Uniswap - TOKEN -> WMON -> USDC
    pricePromises.push(
      client.readContract({
        address: uniswapV2Router as `0x${string}`,
        abi: UNISWAP_V2_ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: [oneToken, [tokenAddress, wmonAddress, usdcAddress]],
      }).then((amounts: any) => {
        const price = amounts?.[2] > 0n ? Number(amounts[2]) / 1e6 : 0;
        return { price, source: 'V2-wmon' };
      }).catch(() => ({ price: 0, source: '' }))
    );
    
    // V2 PancakeSwap - TOKEN -> WMON -> USDC
    pricePromises.push(
      client.readContract({
        address: pancakeV2Router as `0x${string}`,
        abi: UNISWAP_V2_ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: [oneToken, [tokenAddress, wmonAddress, usdcAddress]],
      }).then((amounts: any) => {
        const price = amounts?.[2] > 0n ? Number(amounts[2]) / 1e6 : 0;
        return { price, source: 'Pancake' };
      }).catch(() => ({ price: 0, source: '' }))
    );
    
    // V3 Quoter - TOKEN -> WMON direct (all fee tiers)
    for (const fee of v3FeeTiers) {
      pricePromises.push(
        client.readContract({
          address: uniswapV3Quoter as `0x${string}`,
          abi: UNISWAP_V3_QUOTER_ABI,
          functionName: 'quoteExactInputSingle',
          args: [{ tokenIn: tokenAddress, tokenOut: wmonAddress, amountIn: oneToken, fee, sqrtPriceLimitX96: 0n }],
        }).then(async (result: any) => {
          const wmonAmount = result[0] as bigint;
          if (wmonAmount > 0n) {
            const wmonPrice = await getWmonPrice(chainId);
            const price = (Number(wmonAmount) / 1e18) * wmonPrice;
            return { price, source: `V3-wmon-${fee}` };
          }
          return { price: 0, source: '' };
        }).catch(() => ({ price: 0, source: '' }))
      );
    }
    
    // V3 Quoter - TOKEN -> USDC direct (for major tokens like WETH that have USDC pools)
    for (const fee of v3FeeTiers) {
      pricePromises.push(
        client.readContract({
          address: uniswapV3Quoter as `0x${string}`,
          abi: UNISWAP_V3_QUOTER_ABI,
          functionName: 'quoteExactInputSingle',
          args: [{ tokenIn: tokenAddress, tokenOut: usdcAddress, amountIn: oneToken, fee, sqrtPriceLimitX96: 0n }],
        }).then((result: any) => {
          const usdcAmount = result[0] as bigint;
          if (usdcAmount > 0n) {
            const price = Number(usdcAmount) / 1e6;
            return { price, source: `V3-usdc-${fee}` };
          }
          return { price: 0, source: '' };
        }).catch(() => ({ price: 0, source: '' }))
      );
    }
    
    // Run all in parallel and pick best
    const results = await Promise.all(pricePromises);
    let bestPrice = 0;
    let bestSource = '';
    for (const r of results) {
      if (r.price > bestPrice) {
        bestPrice = r.price;
        bestSource = r.source;
      }
    }
    
    if (bestPrice > 0) {
      console.log(`[PRICE] ${tokenAddress.substring(0,10)} = $${bestPrice.toFixed(6)} via ${bestSource}`);
      priceCache.set(cacheKey, { price: bestPrice, time: Date.now() });
      return bestPrice;
    }
    
    // === Fallback: Try Nad.Fun LENS with multiple amounts ===
    try {
      const nadfunLensAbi = parseAbi([
        'function getAmountOut(address _token, uint256 _amountIn, bool _isBuy) external view returns (address router, uint256 amountOut)',
        'function isGraduated(address _token) external view returns (bool)',
      ]) as any;
      
      // Try different amounts - some bonding curves need smaller amounts
      const amountsToTry = [oneToken, oneToken / 10n, oneToken / 100n, oneToken / 1000n];
      
      for (const tryAmount of amountsToTry) {
        try {
          // Sell tokens -> get MON amount
          const [router, monAmount] = await client.readContract({
            address: nadfunLens as `0x${string}`,
            abi: nadfunLensAbi,
            functionName: 'getAmountOut',
            args: [tokenAddress, tryAmount, false], // false = sell
          }) as [string, bigint];
          
          if (monAmount > 0n) {
            // Get WMON price to convert to USD
            const wmonPrice = await getWmonPrice(chainId);
            // Scale price back to 1 token value
            const scaleFactor = Number(oneToken) / Number(tryAmount);
            const price = (Number(monAmount) / 1e18) * wmonPrice * scaleFactor;
            console.log(`[PRICE] ${tokenAddress.substring(0,10)} = $${price.toFixed(8)} via Nad.Fun`);
            priceCache.set(cacheKey, { price, time: Date.now() });
            return price;
          }
        } catch {}
      }
    } catch {}
    
    priceCache.set(cacheKey, { price: 0, time: Date.now() });
    return 0;
  } catch (e) {
    console.log(`[PRICE_ERROR] ${tokenAddress.substring(0,6)}: ${(e as any).message}`);
    return 0;
  }
}

// Fetch token metadata from blockchain with timeout
async function fetchTokenMetadata(tokenAddress: string, chainId: number): Promise<any> {
  try {
    const normalizedAddress = getAddress(tokenAddress);
    const rpcUrl = RPC_URLS[chainId] || RPC_URLS[143];
    const client = createPublicClient({
      transport: http(rpcUrl),
    });

    // Handle native MON token
    if (normalizedAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
      const logo = fetchTokenLogo('MON', normalizedAddress);
      return {
        address: normalizedAddress,
        symbol: 'MON',
        name: 'Monad',
        decimals: 18,
        logo,
      };
    }

    let name = 'Unknown';
    let symbol = 'TKN';
    let decimals = 18;

    // Fetch all metadata in parallel with 3-second timeout per call
    try {
      const [nameResult, symbolResult, decimalsResult] = await Promise.allSettled([
        Promise.race([
          client.readContract({
            address: normalizedAddress,
            abi: ERC20_ABI,
            functionName: 'name',
          }),
          new Promise((_resolve, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ]),
        Promise.race([
          client.readContract({
            address: normalizedAddress,
            abi: ERC20_ABI,
            functionName: 'symbol',
          }),
          new Promise((_resolve, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ]),
        Promise.race([
          client.readContract({
            address: normalizedAddress,
            abi: ERC20_ABI,
            functionName: 'decimals',
          }),
          new Promise((_resolve, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ]),
      ]);

      if (nameResult.status === 'fulfilled') name = nameResult.value as string;
      if (symbolResult.status === 'fulfilled') symbol = symbolResult.value as string;
      if (decimalsResult.status === 'fulfilled') decimals = decimalsResult.value as number;
    } catch (e) {
      // Use defaults - continue with what we have
    }

    // Skip if we still can't get a symbol
    if (!symbol || symbol === 'TKN') {
      return null;
    }

    const logo = fetchTokenLogo(symbol, normalizedAddress);

    return {
      address: normalizedAddress,
      symbol: symbol.toUpperCase(),
      name,
      decimals,
      logo,
    };
  } catch (error) {
    return null;
  }
}

// Fetch price from a pair contract using getReserves
async function getPriceFromPair(pairAddress: string, tokenAddress: string, chainId: number): Promise<any> {
  const rpcUrl = RPC_URLS[chainId] || RPC_URLS[143];
  const client = createPublicClient({
    transport: http(rpcUrl),
  });

  try {
    const normalizedPair = getAddress(pairAddress);
    const normalizedToken = getAddress(tokenAddress);

    // Get reserves and token info
    const [reserves, token0, token1] = await Promise.all([
      client.readContract({
        address: normalizedPair,
        abi: PAIR_ABI,
        functionName: 'getReserves',
      }),
      client.readContract({
        address: normalizedPair,
        abi: PAIR_ABI,
        functionName: 'token0',
      }),
      client.readContract({
        address: normalizedPair,
        abi: PAIR_ABI,
        functionName: 'token1',
      }),
    ]) as [any, string, string];

    const reserve0 = reserves[0] as bigint;
    const reserve1 = reserves[1] as bigint;

    // Get decimals for both tokens
    const token0Meta = await fetchTokenMetadata(token0 as string, chainId);
    const token1Meta = await fetchTokenMetadata(token1 as string, chainId);

    if (!token0Meta || !token1Meta) return null;

    // Calculate price
    const normalizedToken0 = getAddress(token0 as string);
    const normalizedToken1 = getAddress(token1 as string);

    let price: number;
    if (normalizedToken0.toLowerCase() === normalizedToken.toLowerCase()) {
      // Querying token0 price in token1
      price = Number(reserve1) / Number(reserve0) / (10 ** (token1Meta.decimals - token0Meta.decimals));
    } else {
      // Querying token1 price in token0
      price = Number(reserve0) / Number(reserve1) / (10 ** (token0Meta.decimals - token1Meta.decimals));
    }

    return {
      address: normalizedToken,
      price,
      liquidity: Math.max(Number(reserve0), Number(reserve1)),
      source: 'pair',
    };
  } catch (error) {
    console.error(`Error fetching price from pair ${pairAddress}:`, error);
    return null;
  }
}

// Fetch token balance from blockchain
async function getTokenBalance(tokenAddress: string, userAddress: string, chainId: number): Promise<string> {
  try {
    // Normalize addresses
    let normalizedTokenAddress: `0x${string}`;
    let normalizedUserAddress: `0x${string}`;
    
    try {
      normalizedTokenAddress = getAddress(tokenAddress);
      normalizedUserAddress = getAddress(userAddress);
    } catch {
      return '0';
    }

    const rpcUrl = RPC_URLS[chainId] || RPC_URLS[143];
    const client = createPublicClient({
      transport: http(rpcUrl),
    });

    // Check if it's native MON (special address)
    if (normalizedTokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
      try {
        const balance = await client.getBalance({
          address: normalizedUserAddress,
        });
        // Native token has 18 decimals
        const divisor = BigInt(10) ** BigInt(18);
        const balanceFormatted = (balance / divisor).toString();
        return balanceFormatted;
      } catch (error) {
        console.error('Error fetching native balance:', error);
        return '0';
      }
    }

    // For ERC20 tokens
    try {
      // Get balance
      const balance = await client.readContract({
        address: normalizedTokenAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [normalizedUserAddress],
      }) as bigint;

      // Get decimals
      let decimals = 18;
      try {
        decimals = await client.readContract({
          address: normalizedTokenAddress,
          abi: ERC20_ABI,
          functionName: 'decimals',
        }) as number;
      } catch {
        // Default to 18 if decimals call fails
      }

      // Convert to readable format with proper decimal handling
      const divisor = BigInt(10) ** BigInt(decimals);
      const wholePart = balance / divisor;
      const fractionalPart = balance % divisor;
      
      // Format with decimals (up to 8 decimal places for display)
      const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
      const displayDecimals = Math.min(8, decimals);
      const trimmedFractional = fractionalStr.slice(0, displayDecimals);
      
      // Remove trailing zeros but keep at least some precision
      let formatted = `${wholePart}.${trimmedFractional}`.replace(/\.?0+$/, '');
      if (!formatted.includes('.') && balance > 0n && wholePart === 0n) {
        // Very small balance, show some decimals
        formatted = `0.${trimmedFractional}`;
      }
      
      return formatted || '0';
    } catch (error) {
      console.error('Error fetching ERC20 balance:', error);
      return '0';
    }
  } catch (error) {
    console.error('Error fetching token balance:', error);
    return '0';
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Register token endpoint (will be used when TokenRegistry contract is deployed)
  app.post("/api/register-token", async (req, res) => {
    try {
      const registryAddr = (import.meta.env.VITE_TOKEN_REGISTRY_ADDRESS as string) || '';
      
      if (!registryAddr || registryAddr === '0x0000000000000000000000000000000000000000') {
        return res.status(400).json({ error: "Token Registry not deployed yet" });
      }

      // TODO: Implement when contract is deployed
      return res.status(501).json({ error: "Token registration coming soon" });
    } catch (error) {
      console.error('Error registering token:', error);
      return res.status(500).json({ error: 'Failed to register token' });
    }
  });

  // Fetch tokens from all Monad DEX factories with caching
  app.get("/api/tokens", async (req, res) => {
    try {
      const chainId = parseInt((req.query.chainId as string) || '143');
      const forceRefresh = req.query.refresh === 'true';
      
      // Check cache - return cached data if valid
      if (!forceRefresh && tokenCache.length > 0 && (Date.now() - lastCacheUpdate) < CACHE_DURATION) {
        console.log('[TOKENS] Returning cached token list');
        return res.json(tokenCache);
      }
      
      // If a fetch is already in progress, return cached data (even if stale)
      if (tokenFetchInProgress) {
        console.log('[TOKENS] Fetch in progress, returning cached data');
        if (tokenCache.length > 0) return res.json(tokenCache);
        // If no cache, wait briefly and retry
        await new Promise(r => setTimeout(r, 500));
        if (tokenCache.length > 0) return res.json(tokenCache);
      }
      
      tokenFetchInProgress = true;

      // Start with core MON token and fetch its logo and price
      const nativeMonAddress = '0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE';
      const monLogo = 'https://dd.dexscreener.com/ds-data/tokens/monad/0x3bd359c1119da7da1d913d1c4d2b7c461115433a.png';
      const monPrice = await fetchTokenPrice('MON', nativeMonAddress, chainId);
      const tokenMap = new Map<string, any>();
      tokenMap.set(nativeMonAddress.toLowerCase(), {
        address: nativeMonAddress,
        symbol: 'MON',
        name: 'Monad',
        decimals: 18,
        logo: monLogo,
        price: monPrice,
        source: 'native'
      });

      // Discover tokens from known DEX pairs
      const discoveredTokens = await discoverTokensFromPairs(chainId);
      
      // Fetch logos and prices in small batches to avoid RPC overload
      const tokensToFetch = Array.from(discoveredTokens.entries())
        .filter(([addr]) => !tokenMap.has(addr));

      const BATCH_SIZE = 3; // Process 3 tokens at a time to prevent RPC overload
      const enhancedTokens: any[] = [];
      
      for (let i = 0; i < tokensToFetch.length; i += BATCH_SIZE) {
        const batch = tokensToFetch.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async ([addr, token]) => {
            const logo = token.logo || fetchTokenLogo(token.symbol, token.address);
            const price = await fetchTokenPrice(token.symbol, token.address, chainId);
            return {
              ...token,
              logo,
              price
            };
          })
        );
        enhancedTokens.push(...batchResults);
        // Delay between batches to let RPC recover
        if (i + BATCH_SIZE < tokensToFetch.length) {
          await new Promise(r => setTimeout(r, 200));
        }
      }

      // Add enhanced tokens to map - skip "UNK" tokens
      for (const token of enhancedTokens) {
        // Skip unknown tokens (failed to fetch symbol)
        if (token.symbol !== 'UNK') {
          tokenMap.set(token.address.toLowerCase(), token);
        }
      }

      // Convert to array - show all tokens regardless of price
      let allTokens = Array.from(tokenMap.values());
      
      // AGGRESSIVE MERGE: Always include ALL known tokens + preserve prices
      const newTokenMap = new Map<string, any>();
      
      // Start with all known tokens (ensures list is always complete)
      for (const known of KNOWN_TOKENS) {
        newTokenMap.set(known.address.toLowerCase(), { ...known });
      }
      
      // Add any newly discovered tokens from this fetch
      for (const token of allTokens) {
        const addr = token.address.toLowerCase();
        const existing = newTokenMap.get(addr);
        if (existing) {
          // Update with new data, keeping better price
          existing.name = token.name || existing.name;
          existing.logo = token.logo || existing.logo;
          if (token.price > 0) {
            existing.price = token.price;
          }
        } else {
          newTokenMap.set(addr, token);
        }
      }
      
      // Restore prices from cache for tokens that have $0
      for (const cached of tokenCache) {
        const addr = cached.address.toLowerCase();
        const current = newTokenMap.get(addr);
        
        if (current && (current.price === 0 || current.price === undefined) && 
            cached.price > 0 && cached.price < 1e12) {
          current.price = cached.price;
          console.log(`[TOKENS] Restored cached price for ${current.symbol}: $${cached.price.toFixed(6)}`);
        }
      }
      
      allTokens = Array.from(newTokenMap.values());
      
      // Count how many tokens have valid prices (non-zero, reasonable values)
      const countPricedTokens = (tokens: any[]) => 
        tokens.filter(t => t.price > 0 && t.price < 1e12).length;
      
      const finalPricedCount = countPricedTokens(allTokens);
      
      console.log(`[TOKENS] Total ${allTokens.length} tokens, ${finalPricedCount} with prices after merge`);
      
      // Always update cache with merged data
      tokenCache = allTokens;
      lastCacheUpdate = Date.now();
      tokenFetchInProgress = false;
      
      return res.json(allTokens);
    } catch (error) {
      tokenFetchInProgress = false;
      console.error('Error fetching tokens:', error);
      // Return cached tokens even if fetch fails
      if (tokenCache.length > 0) {
        return res.json(tokenCache);
      }
      return res.status(500).json({ error: 'Failed to fetch tokens' });
    }
  });

  // Logo proxy endpoint - resolves actual image URL from various sources
  app.get("/api/token-logo", async (req, res) => {
    try {
      const { address, symbol } = req.query;
      
      if (!address || typeof address !== 'string') {
        return res.redirect(`https://dd.dexscreener.com/ds-data/tokens/monad/${address}.png`);
      }

      const addr = address.toLowerCase();
      const sym = (symbol as string || 'TKN').toUpperCase();

      // Try multiple sources in order: Nad.Fun, DexScreener, Trust Wallet, 1inch
      const sources = [
        `https://app.nad.fun/api/tokens/${addr}/logo`, // Nad.Fun factory
        `https://dd.dexscreener.com/ds-data/tokens/monad/${addr}.png`,
        `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/monad/assets/${addr}/logo.png`,
        `https://token.1inch.io/v2/143/${addr}`,
      ];

      for (const source of sources) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          const response = await fetch(source, { signal: controller.signal });
          clearTimeout(timeoutId);
          
          if (response.ok) {
            const contentType = response.headers.get('content-type');
            
            // Handle 1inch JSON response
            if (source.includes('1inch.io') && contentType?.includes('json')) {
              try {
                const data = await response.json();
                if (data.logoURI) {
                  const imgController = new AbortController();
                  const imgTimeoutId = setTimeout(() => imgController.abort(), 3000);
                  const imgResponse = await fetch(data.logoURI, { signal: imgController.signal });
                  clearTimeout(imgTimeoutId);
                  if (imgResponse.ok) {
                    const buffer = await imgResponse.arrayBuffer();
                    res.set('Content-Type', imgResponse.headers.get('content-type') || 'image/png');
                    res.set('Cache-Control', 'public, max-age=86400');
                    return res.send(Buffer.from(buffer));
                  }
                }
              } catch (e) {
                // Try next source
              }
            } else if (contentType?.includes('image')) {
              const buffer = await response.arrayBuffer();
              res.set('Content-Type', contentType);
              res.set('Cache-Control', 'public, max-age=86400');
              return res.send(Buffer.from(buffer));
            }
          }
        } catch (e) {
          // Try next source
        }
      }

      // Final fallback - redirect to DexScreener
      return res.redirect(`https://dd.dexscreener.com/ds-data/tokens/monad/${addr}.png`);
    } catch (error) {
      console.error('Logo endpoint error:', error);
      res.redirect('https://dd.dexscreener.com/ds-data/tokens/monad/unknown.png');
    }
  });

  // Token data endpoint
  app.get("/api/token-data", async (req, res) => {
    try {
      let { address, chainId } = req.query;
      
      if (!address) {
        return res.status(400).json({ error: "Missing token address" });
      }

      // Normalize address to checksum format
      let normalizedAddress: `0x${string}`;
      try {
        normalizedAddress = getAddress(address as string);
      } catch {
        return res.status(400).json({ error: "Invalid token address" });
      }

      const cid = chainId ? parseInt(chainId as string) : 143;
      const rpcUrl = RPC_URLS[cid] || RPC_URLS[143];
      const client = createPublicClient({
        transport: http(rpcUrl),
      });

      let name = 'Token';
      let symbol = 'TKN';
      let decimals = 18;
      let logo = '';

      // Helper to add timeout to RPC calls
      const withTimeout = <T,>(promise: Promise<T>, ms: number = 5000): Promise<T> => {
        return Promise.race([
          promise,
          new Promise<T>((_, reject) => setTimeout(() => reject(new Error('RPC timeout')), ms))
        ]);
      };

      // Get symbol with timeout
      try {
        symbol = await withTimeout(
          client.readContract({
            address: normalizedAddress,
            abi: ERC20_ABI,
            functionName: 'symbol',
          }) as Promise<string>
        );
      } catch (e) {
        console.log(`[TOKEN_DATA] Failed to fetch symbol for ${normalizedAddress}:`, (e as Error).message);
      }

      // Get name with timeout
      try {
        name = await withTimeout(
          client.readContract({
            address: normalizedAddress,
            abi: ERC20_ABI,
            functionName: 'name',
          }) as Promise<string>
        );
      } catch (e) {
        console.log(`[TOKEN_DATA] Failed to fetch name for ${normalizedAddress}:`, (e as Error).message);
      }

      // Get decimals with timeout
      try {
        decimals = await withTimeout(
          client.readContract({
            address: normalizedAddress,
            abi: ERC20_ABI,
            functionName: 'decimals',
          }) as Promise<number>
        );
      } catch (e) {
        console.log(`[TOKEN_DATA] Failed to fetch decimals for ${normalizedAddress}:`, (e as Error).message);
      }

      // Use same logo fetching logic as token list
      logo = await fetchTokenLogo(symbol, normalizedAddress, 143);

      // Fetch price using same logic as token list
      const price = await fetchTokenPrice(symbol, normalizedAddress, cid);

      res.json({ 
        name,
        symbol,
        decimals,
        logo,
        price
      });
    } catch (error) {
      console.error('Token data error:', error);
      res.status(500).json({ error: "Failed to fetch token data" });
    }
  });

  // Token URI endpoint - get tokenURI metadata for any token (including non-bonded)
  app.get("/api/token-uri/:address", async (req, res) => {
    try {
      const { address } = req.params;
      
      if (!address) {
        return res.status(400).json({ error: "Missing token address" });
      }

      let normalizedAddress: `0x${string}`;
      try {
        normalizedAddress = getAddress(address);
      } catch {
        return res.status(400).json({ error: "Invalid token address" });
      }

      const client = createPublicClient({
        transport: http(RPC_URLS[143]),
      });

      // Try to fetch tokenURI from the token contract
      let tokenURI = null;
      let metadata = null;
      let logo = null;

      try {
        tokenURI = await client.readContract({
          address: normalizedAddress,
          abi: NAD_FUN_TOKEN_ABI,
          functionName: 'tokenURI',
        }) as string;
        
        console.log(`[TOKEN_URI] Raw tokenURI for ${address}: ${tokenURI?.slice(0, 100)}...`);

        // Parse the tokenURI to get metadata
        if (tokenURI) {
          if (tokenURI.startsWith('data:application/json;base64,')) {
            // Base64 encoded JSON metadata
            const base64Data = tokenURI.split(',')[1];
            const jsonStr = Buffer.from(base64Data, 'base64').toString('utf8');
            metadata = JSON.parse(jsonStr);
            logo = metadata.image;
          } else if (tokenURI.startsWith('data:application/json')) {
            // Direct JSON
            const jsonStr = tokenURI.replace('data:application/json,', '');
            metadata = JSON.parse(decodeURIComponent(jsonStr));
            logo = metadata.image;
          } else if (tokenURI.startsWith('http')) {
            // URL - fetch metadata
            const metaResponse = await fetch(tokenURI, { signal: AbortSignal.timeout(5000) });
            if (metaResponse.ok) {
              metadata = await metaResponse.json();
              logo = metadata.image;
            }
          } else if (tokenURI.startsWith('ipfs://')) {
            // IPFS URL
            const ipfsUrl = tokenURI.replace('ipfs://', 'https://ipfs.io/ipfs/');
            const metaResponse = await fetch(ipfsUrl, { signal: AbortSignal.timeout(5000) });
            if (metaResponse.ok) {
              metadata = await metaResponse.json();
              logo = metadata.image;
            }
          }
        }
      } catch (e) {
        console.log(`[TOKEN_URI] No tokenURI for ${address}: ${(e as Error).message}`);
      }

      // Also try to get basic ERC20 info
      let symbol = 'TKN';
      let name = 'Token';
      let decimals = 18;

      try {
        symbol = await client.readContract({
          address: normalizedAddress,
          abi: ERC20_ABI,
          functionName: 'symbol',
        }) as string;
      } catch {}

      try {
        name = await client.readContract({
          address: normalizedAddress,
          abi: ERC20_ABI,
          functionName: 'name',
        }) as string;
      } catch {}

      try {
        decimals = await client.readContract({
          address: normalizedAddress,
          abi: ERC20_ABI,
          functionName: 'decimals',
        }) as number;
      } catch {}

      // Check if graduated via Nad.Fun
      let isGraduated = false;
      let isNadFun = false;
      try {
        isGraduated = await client.readContract({
          address: NAD_FUN_LENS as `0x${string}`,
          abi: NAD_FUN_LENS_ABI,
          functionName: 'isGraduated',
          args: [normalizedAddress],
        }) as boolean;
        isNadFun = true;
      } catch {
        // Not a Nad.Fun token or lens not available
      }

      // Fallback logo from DexScreener if no tokenURI
      if (!logo) {
        logo = `https://dd.dexscreener.com/ds-data/tokens/monad/${normalizedAddress.toLowerCase()}.png`;
      }

      res.json({
        address: normalizedAddress,
        symbol,
        name,
        decimals,
        tokenURI,
        metadata,
        logo,
        isNadFun,
        isGraduated,
      });
    } catch (error) {
      console.error('Token URI error:', error);
      res.status(500).json({ error: "Failed to fetch token URI" });
    }
  });

  // Balance API endpoint
  app.post("/api/balance", async (req, res) => {
    try {
      const { tokenAddress, userAddress, chainId } = req.body;
      
      if (!tokenAddress || !userAddress || !chainId) {
        return res.status(400).json({ error: "Missing required fields: tokenAddress, userAddress, chainId" });
      }

      console.log(`[BALANCE] Fetching balance for token=${tokenAddress.slice(0,10)}... user=${userAddress.slice(0,10)}...`);
      const balance = await getTokenBalance(tokenAddress, userAddress, chainId);
      console.log(`[BALANCE] Result: ${balance}`);
      res.json({ balance });
    } catch (error) {
      console.error('Balance endpoint error:', error);
      res.status(500).json({ error: "Failed to fetch balance" });
    }
  });

  // Pathfinder API - find optimal split routing across DEXes
  app.post("/api/swap/pathfinder", async (req, res) => {
    try {
      const { tokenIn, tokenOut, amountIn, slippageBps = 100, tokenInDecimals = 18 } = req.body;
      
      if (!tokenIn || !tokenOut || !amountIn) {
        return res.status(400).json({ error: "Missing required fields: tokenIn, tokenOut, amountIn" });
      }

      console.log(`[PATHFINDER] Finding best path for ${amountIn} ${tokenIn} (${tokenInDecimals} dec) -> ${tokenOut}`);
      
      const result = await findBestPath(tokenIn, tokenOut, amountIn, slippageBps, tokenInDecimals);
      
      console.log(`[PATHFINDER] Found ${result.routes.length} routes, best: ${result.bestSingleDex}, split: ${result.isSplitBetter}`);
      
      res.json(result);
    } catch (error) {
      console.error('Pathfinder error:', error);
      res.status(500).json({ error: "Failed to find path" });
    }
  });

  // Check if token is from Nad.Fun
  app.get("/api/token/nadfun/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const result = await isNadFunToken(address);
      res.json(result);
    } catch (error) {
      console.error('Nad.Fun check error:', error);
      res.status(500).json({ error: "Failed to check token" });
    }
  });
  
  // Multi-hop pathfinder - Token to Token swaps through WMON
  app.post("/api/swap/multihop", async (req, res) => {
    try {
      const { tokenIn, tokenOut, amountIn, slippageBps = 100, tokenInDecimals = 18 } = req.body;
      
      if (!tokenIn || !tokenOut || !amountIn) {
        return res.status(400).json({ error: "Missing required fields: tokenIn, tokenOut, amountIn" });
      }

      console.log(`[MULTIHOP] Finding path for ${amountIn} ${tokenIn} -> ${tokenOut}`);
      
      const result = await findBestTokenToTokenPath(tokenIn, tokenOut, amountIn, slippageBps, tokenInDecimals);
      
      console.log(`[MULTIHOP] Recommendation: ${result.recommendation}`);
      
      res.json(result);
    } catch (error) {
      console.error('Multi-hop pathfinder error:', error);
      res.status(500).json({ error: "Failed to find multi-hop path" });
    }
  });

  // MON price endpoint
  app.get("/api/swap/mon-price", async (req, res) => {
    try {
      const price = await getWMONPriceUSD();
      res.json({ price, timestamp: Date.now() });
    } catch (error) {
      console.error('MON price error:', error);
      res.json({ price: 0.035, timestamp: Date.now() });
    }
  });

  // Swap quote endpoint - get best price across all DEXes
  app.post("/api/swap/quote", async (req, res) => {
    try {
      const { tokenIn, tokenOut, amountIn, chainId } = req.body;
      
      if (!tokenIn || !tokenOut || !amountIn || !chainId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Token decimals lookup (USDC = 6, others = 18)
      const usdcAddress = '0x754704Bc059F8C67012fEd69BC8A327a5aafb603'.toLowerCase();
      const inDecimals = tokenIn.toLowerCase() === usdcAddress ? 6 : 18;
      const outDecimals = tokenOut.toLowerCase() === usdcAddress ? 6 : 18;
      
      // Convert amount to wei using correct decimals for input token
      const amountFloat = parseFloat(amountIn);
      const inMultiplier = Math.pow(10, inDecimals);
      const amountInWei = BigInt(Math.floor(amountFloat * inMultiplier));
      
      console.log(`[QUOTE] ${amountIn} tokens (${inDecimals} decimals) = ${amountInWei} wei, ${tokenIn} -> ${tokenOut}`);
      
      const quotes = await getAllSwapQuotes(tokenIn as `0x${string}`, tokenOut as `0x${string}`, amountInWei);
      
      // Convert output to human-readable using output token decimals
      const outDivisor = Math.pow(10, outDecimals);
      
      // Convert quotes array to object mapping dex name to human-readable amount
      const quotesObj: Record<string, number> = {};
      for (const quote of quotes.quotes) {
        quotesObj[quote.dex] = parseFloat(quote.amountOut) / outDivisor;
      }
      
      // Convert best quote amount to human-readable
      const bestAmountOut = parseFloat(quotes.bestQuote.amountOut) / outDivisor;
      
      console.log(`[QUOTE] Best: ${quotes.bestQuote.dex} = ${bestAmountOut.toFixed(6)}`);
      
      res.json({
        tokenIn,
        tokenOut,
        amountIn,
        amountOut: bestAmountOut.toFixed(6),
        bestDex: quotes.bestQuote.dex,
        bestQuote: {
          dex: quotes.bestQuote.dex,
          amountOut: bestAmountOut.toFixed(6),
          v3Fee: (quotes.bestQuote as any).v3Fee || 0,
          router: quotes.bestQuote.router || '',
        },
        quotes: quotesObj,
        priceImpact: `${quotes.bestQuote.priceImpact}%`
      });
    } catch (error) {
      console.error('Quote endpoint error:', error);
      res.status(500).json({ error: "Failed to fetch quote" });
    }
  });

  // Execute swap endpoint
  app.post("/api/swap/execute", async (req, res) => {
    try {
      const { tokenIn, tokenOut, amountIn, minAmountOut, dexRoute, userAddress } = req.body;
      
      if (!tokenIn || !tokenOut || !amountIn || !minAmountOut || !dexRoute) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Swap execution via SwapAggregator contract
      // Routes to best DEX based on dexRoute parameter (uniswap/pancakeswap/nadfun)
      const swapAggregatorAddress = process.env.VITE_SWAP_AGGREGATOR_ADDRESS || '0x0000000000000000000000000000000000000000';
      
      res.json({
        txHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
        status: "pending",
        dex: dexRoute,
        contractAddress: swapAggregatorAddress
      });
    } catch (error) {
      console.error('Swap execution error:', error);
      res.status(500).json({ error: "Failed to execute swap" });
    }
  });

  // Locks API Routes
  
  // Get all locks (admin endpoint)
  app.get("/api/locks/all", async (req, res) => {
    try {
      const locks = await storage.getAllLocks();
      res.json(locks);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch locks" });
    }
  });

  // Get locks by user address
  app.get("/api/locks/user/:address", async (req, res) => {
    try {
      const locks = await storage.getUserLocks(req.params.address);
      res.json(locks);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user locks" });
    }
  });

  // Get specific lock
  app.get("/api/locks/:id", async (req, res) => {
    try {
      const lock = await storage.getLockById(parseInt(req.params.id));
      if (!lock) {
        return res.status(404).json({ error: "Lock not found" });
      }
      res.json(lock);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch lock" });
    }
  });

  // Approve token (just validate - actual approval happens on frontend via wallet)
  app.post("/api/locks/approve", async (req, res) => {
    try {
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to approve tokens" });
    }
  });

  // Backend-signed lock creation (for users who can't confirm via wallet)
  app.post("/api/locks/create-backend-signed", async (req, res) => {
    try {
      const { tokenAddress, amount, unlockTime, ownerAddress } = req.body;
      
      if (!tokenAddress || !amount || !unlockTime || !ownerAddress) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const privateKey = process.env.WALLET_PRIVATE_KEY as `0x${string}`;
      if (!privateKey) {
        return res.status(500).json({ error: "Backend wallet not configured" });
      }

      const account = privateKeyToAccount(privateKey);
      const client = createWalletClient({
        account,
        chain: {
          id: 143,
          name: 'Monad',
          network: 'monad',
          nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
          rpcUrls: { default: { http: ['https://rpc3.monad.xyz/'] } },
          blockExplorers: { default: { name: 'Monad Vision', url: 'https://monadvision.com/' } },
        },
        transport: http('https://rpc3.monad.xyz/'),
      });

      const lockerAddress = '0xebff40de9bbd42570a4a972a9f62cacb004a1597' as `0x${string}`;
      const tokenAddr = getAddress(tokenAddress);
      const approveAmount = parseUnits(amount.toString(), 18);

      // Step 1: Approve tokens
      const approveAbi = [
        { type: 'function' as const, name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }
      ] as const;

      const approveTxData = encodeFunctionData({
        abi: approveAbi,
        functionName: 'approve',
        args: [lockerAddress, approveAmount]
      });

      const approveTxHash = await client.sendTransaction({
        to: tokenAddr,
        data: approveTxData,
        gas: BigInt(100000),
      });
      console.log('Approve tx sent:', approveTxHash);
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 2: Create lock
      const lockerAbi = [
        { type: 'function' as const, name: 'createLock', inputs: [{ name: '_token', type: 'address' }, { name: '_amount', type: 'uint256' }, { name: '_unlockTime', type: 'uint256' }], outputs: [] }
      ] as const;

      const lockTxData = encodeFunctionData({
        abi: lockerAbi,
        functionName: 'createLock',
        args: [tokenAddr, approveAmount, BigInt(unlockTime)]
      });

      const lockTxHash = await client.sendTransaction({
        to: lockerAddress,
        data: lockTxData,
        gas: BigInt(200000),
      });
      console.log('Lock tx sent:', lockTxHash);

      // Store in database
      const lock = await storage.createLock({
        owner: ownerAddress,
        token: tokenAddress,
        amount: amount.toString(),
        unlockTime: unlockTime,
        withdrawn: false,
      });

      res.json({ success: true, lock, txHash: lockTxHash });
    } catch (error) {
      console.error('Backend lock creation error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create lock" });
    }
  });

  // Create lock (stores lock info in database after blockchain tx)
  app.post("/api/locks/create", async (req, res) => {
    try {
      const { tokenAddress, amount, unlockTime, ownerAddress, txHash } = req.body;
      
      if (!txHash) {
        return res.status(400).json({ error: "Transaction hash required" });
      }
      
      const lock = await storage.createLock({
        owner: ownerAddress,
        token: tokenAddress,
        amount: amount,
        unlockTime: unlockTime,
        withdrawn: false,
      });
      
      res.json(lock);
    } catch (error) {
      res.status(500).json({ error: "Failed to create lock" });
    }
  });

  // Withdraw lock
  app.post("/api/locks/:id/withdraw", async (req, res) => {
    try {
      const { userAddress } = req.body;
      const lockId = parseInt(req.params.id);
      
      const success = await storage.withdrawLock(lockId, userAddress);
      
      if (!success) {
        return res.status(400).json({ error: "Failed to withdraw lock" });
      }
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to withdraw lock" });
    }
  });

  // Emergency withdraw (admin only)
  app.post("/api/locks/:id/emergency-withdraw", async (req, res) => {
    try {
      const { adminAddress } = req.body;
      const lockId = parseInt(req.params.id);
      
      const success = await storage.emergencyWithdrawLock(lockId, adminAddress);
      
      if (!success) {
        return res.status(400).json({ error: "Failed to perform emergency withdrawal" });
      }
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to perform emergency withdrawal" });
    }
  });

  // =============================================
  // SWAP TRACKING & LEADERBOARD ENDPOINTS
  // =============================================

  // Record a swap transaction (called after successful swap) - GOOGLE SHEETS
  app.post("/api/swaps/record", async (req, res) => {
    try {
      const { txHash, walletAddress, tokenIn, tokenInSymbol, tokenOut, tokenOutSymbol, amountIn, amountOut, volumeMon, dex } = req.body;
      
      if (!txHash || !walletAddress || !tokenIn || !tokenOut) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Save to PostgreSQL database (primary)
      try {
        await storage.recordSwap({
          txHash,
          walletAddress: walletAddress.toLowerCase(),
          tokenIn: tokenIn.toLowerCase(),
          tokenInSymbol: tokenInSymbol || '',
          tokenOut: tokenOut.toLowerCase(),
          tokenOutSymbol: tokenOutSymbol || '',
          amountIn: amountIn || '0',
          amountOut: amountOut || '0',
          volumeMon: volumeMon || '0',
          dex: dex || 'unknown',
        });
        console.log(`[ROUTES] Recorded swap to DB: ${txHash.slice(0, 10)}... volume=${volumeMon} MON`);
      } catch (dbError: any) {
        // Ignore duplicate key errors (already recorded)
        if (!dbError.message?.includes('duplicate')) {
          console.error('[ROUTES] DB error (continuing):', dbError.message);
        }
      }

      // Also save to Google Sheets (backup)
      try {
        await recordSwapToSheet({
          txHash,
          walletAddress,
          tokenIn,
          tokenInSymbol: tokenInSymbol || '',
          tokenOut,
          tokenOutSymbol: tokenOutSymbol || '',
          amountIn: amountIn || '0',
          amountOut: amountOut || '0',
          volumeMon: volumeMon || '0',
          dex: dex || 'unknown',
        });
      } catch (sheetError) {
        console.error('[ROUTES] Google Sheets error (continuing):', sheetError);
      }

      res.json({ success: true });
    } catch (error) {
      console.error('[ROUTES] Error recording swap:', error);
      res.status(500).json({ error: "Failed to record swap" });
    }
  });

  // Get leaderboard (top swappers) - PostgreSQL primary, Google Sheets fallback
  app.get("/api/leaderboard", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      
      // Try PostgreSQL first (primary)
      try {
        const [leaderboard, totalVolume, totalSwappers] = await Promise.all([
          storage.getTopSwappers(limit),
          storage.getTotalVolume(),
          storage.getTotalSwappers(),
        ]);
        
        if (leaderboard.length > 0 || totalVolume > 0) {
          return res.json({
            leaderboard,
            totalVolume,
            totalSwappers,
            source: 'database',
          });
        }
      } catch (dbError) {
        console.error('[ROUTES] DB leaderboard error, falling back to Sheets:', dbError);
      }
      
      // Fallback to Google Sheets
      const [leaderboard, stats] = await Promise.all([
        getSwapLeaderboard(limit),
        getSwapStats(),
      ]);

      res.json({
        leaderboard,
        totalVolume: stats.totalVolume,
        totalSwappers: stats.totalSwappers,
        source: 'sheets',
      });
    } catch (error) {
      console.error('[ROUTES] Error fetching leaderboard:', error);
      res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
  });

  // Get total stats - PostgreSQL primary, Google Sheets fallback
  app.get("/api/stats", async (req, res) => {
    try {
      // Try PostgreSQL first
      try {
        const [totalVolume, totalSwappers] = await Promise.all([
          storage.getTotalVolume(),
          storage.getTotalSwappers(),
        ]);
        
        if (totalVolume > 0 || totalSwappers > 0) {
          return res.json({
            totalVolume,
            totalSwappers,
            source: 'database',
          });
        }
      } catch (dbError) {
        console.error('[ROUTES] DB stats error, falling back to Sheets:', dbError);
      }
      
      // Fallback to Google Sheets
      const stats = await getSwapStats();
      res.json({
        totalVolume: stats.totalVolume,
        totalSwappers: stats.totalSwappers,
        source: 'sheets',
      });
    } catch (error) {
      console.error('[ROUTES] Error fetching stats:', error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // =============================================
  // STAKING TRACKING ENDPOINTS - GOOGLE SHEETS
  // =============================================

  // Record a staking transaction
  app.post("/api/stakes/record", async (req, res) => {
    try {
      const { txHash, walletAddress, action, amount } = req.body;
      
      if (!txHash || !walletAddress || !action || !amount) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      await recordStakeToSheet({
        txHash,
        walletAddress,
        action,
        amount,
      });

      console.log(`[ROUTES] Recorded stake to Google Sheets: ${txHash.slice(0, 10)}... action=${action} amount=${amount}`);
      res.json({ success: true });
    } catch (error) {
      console.error('[ROUTES] Error recording stake:', error);
      res.status(500).json({ error: "Failed to record stake" });
    }
  });

  // Get staking leaderboard (top stakers) - GOOGLE SHEETS
  app.get("/api/staking/leaderboard", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const [leaderboard, stats] = await Promise.all([
        getStakingLeaderboard(limit),
        getStakingStats(),
      ]);

      res.json({
        leaderboard,
        totalStaked: stats.totalStaked,
        totalStakers: stats.totalStakers,
      });
    } catch (error) {
      console.error('[ROUTES] Error fetching staking leaderboard:', error);
      res.status(500).json({ error: "Failed to fetch staking leaderboard" });
    }
  });

  // Get combined stats - GOOGLE SHEETS
  app.get("/api/stats/all", async (req, res) => {
    try {
      const [swapStats, stakingStats] = await Promise.all([
        getSwapStats(),
        getStakingStats(),
      ]);

      res.json({
        swaps: { totalVolume: swapStats.totalVolume, totalSwappers: swapStats.totalSwappers },
        staking: { totalStaked: stakingStats.totalStaked, totalStakers: stakingStats.totalStakers },
      });
    } catch (error) {
      console.error('[ROUTES] Error fetching all stats:', error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Referral code lookup
  app.get("/api/referral/lookup", async (req, res) => {
    try {
      const { code } = req.query;

      if (!code || typeof code !== 'string') {
        return res.status(400).json({ message: 'Referral code required' });
      }

      const result = await storage.getReferralByCode(code.toUpperCase());

      if (!result) {
        return res.status(404).json({ message: 'Code not found' });
      }

      res.json({ referrerWallet: result.walletAddress });
    } catch (error: any) {
      console.error('[ROUTES] Error looking up referral:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Generate referral code
  app.post("/api/referral/generate", async (req, res) => {
    try {
      const { walletAddress } = req.body;

      if (!walletAddress) {
        return res.status(400).json({ message: 'Wallet address required' });
      }

      const existing = await storage.getReferralByWallet(walletAddress);
      if (existing) {
        return res.json({ code: existing.code, referrerWallet: existing.walletAddress });
      }

      const code = `NEK${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      const newReferral = await storage.createReferral(walletAddress, code);

      res.json({ code: newReferral.code, referrerWallet: newReferral.walletAddress });
    } catch (error: any) {
      console.error('[ROUTES] Error generating referral:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get referral stats
  app.get("/api/referral/stats", async (req, res) => {
    try {
      const wallet = (req.query.wallet || req.query.walletAddress) as string;

      if (!wallet) {
        return res.status(400).json({ message: 'Wallet address required' });
      }

      const referral = await storage.getReferralByWallet(wallet);
      if (!referral) {
        return res.json({
          code: null,
          totalEarnings: "0",
          pendingEarnings: "0",
          claimedEarnings: "0",
          referralCount: 0,
        });
      }

      const stats = await storage.getReferralStats(wallet);

      res.json({
        code: referral.code,
        totalEarnings: stats.totalEarnings,
        pendingEarnings: stats.pendingEarnings,
        claimedEarnings: stats.claimedEarnings,
        referralCount: stats.referralCount,
      });
    } catch (error: any) {
      console.error('[ROUTES] Error fetching referral stats:', error);
      res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}
