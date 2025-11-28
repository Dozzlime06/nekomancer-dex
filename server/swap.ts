import type { Address } from 'viem';
import { createPublicClient, http, parseAbi, formatUnits, parseUnits } from 'viem';

const publicClient = createPublicClient({
  transport: http('https://rpc3.monad.xyz/'),
});

export interface QuoteResult {
  dex: string;
  amountOut: string;
  priceImpact: number;
  router: string;
  path: string[];
}

export interface SwapQuotes {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  quotes: QuoteResult[];
  bestQuote: QuoteResult;
}

// Official Monad Mainnet Contract Addresses (Nov 2025)
const WMON = '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A' as Address;
const USDC = '0x754704Bc059F8C67012fEd69BC8A327a5aafb603' as Address;
const WETH = '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242' as Address;

// All DEX Routers on Monad
const DEX_CONFIG = {
  // Uniswap V2
  uniswapV2: {
    router: '0x4b2ab38dbf28d31d467aa8993f6c2585981d6804' as Address,
    factory: '0x182a927119d56008d921126764bf884221b10f59' as Address,
  },
  // Uniswap V3
  uniswapV3: {
    swapRouter: '0xfe31f71c1b106eac32f1a19239c9a9a72ddfb900' as Address,
    quoterV2: '0x661e93cca42afacb172121ef892830ca3b70f08d' as Address,
    factory: '0x204faca1764b154221e35c0d20abb3c525710498' as Address,
  },
  // PancakeSwap V2
  pancakeswapV2: {
    router: '0xB1Bc24c34e88f7D43D5923034E3a14B24DaACfF9' as Address,
    factory: '0x02a84c1b3BBD7401a5f7fa98a384EBC70bB5749E' as Address,
  },
  // Nad.Fun
  nadfun: {
    lens: '0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea' as Address,
    bondingCurveRouter: '0x6F6B8F1a20703309951a5127c45B49b1CD981A22' as Address,
    dexRouter: '0x0B79d71AE99528D1dB24A4148b5f4F865cc2b137' as Address,
    bondingCurve: '0xA7283d07812a02AFB7C09B60f8896bCEA3F90aCE' as Address,
  },
};

// ABIs
const V2_ROUTER_ABI = parseAbi([
  'function getAmountsOut(uint amountIn, address[] path) external view returns (uint[] amounts)',
]);

const V3_QUOTER_ABI = parseAbi([
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
]);

const NADFUN_LENS_ABI = parseAbi([
  'function getAmountOut(address _token, uint256 _amountIn, bool _isBuy) external view returns (address router, uint256 amountOut)',
  'function isGraduated(address _token) external view returns (bool)',
  'function isLocked(address _token) external view returns (bool)',
]);

const ERC20_ABI = parseAbi([
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
]);

// Token decimals cache
const decimalsCache = new Map<string, number>();

async function getDecimals(token: Address): Promise<number> {
  const cached = decimalsCache.get(token.toLowerCase());
  if (cached !== undefined) return cached;
  
  // Known tokens
  const known: Record<string, number> = {
    [WMON.toLowerCase()]: 18,
    [USDC.toLowerCase()]: 6,
    '0x98cba48cfb0573e1635ae00d8b3b43b4fad844d6': 6, // USDT
  };
  
  if (known[token.toLowerCase()]) {
    decimalsCache.set(token.toLowerCase(), known[token.toLowerCase()]);
    return known[token.toLowerCase()];
  }
  
  try {
    const decimals = await publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'decimals',
    }) as number;
    decimalsCache.set(token.toLowerCase(), decimals);
    return decimals;
  } catch {
    return 18;
  }
}

// Get quote from V2 router (Uniswap V2, PancakeSwap V2)
async function getV2Quote(
  router: Address,
  dexName: string,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint
): Promise<QuoteResult> {
  const result: QuoteResult = {
    dex: dexName,
    amountOut: '0',
    priceImpact: 0,
    router: router,
    path: [],
  };
  
  // Try direct path
  try {
    const directPath = [tokenIn, tokenOut];
    const amounts = await publicClient.readContract({
      address: router,
      abi: V2_ROUTER_ABI,
      functionName: 'getAmountsOut',
      args: [amountIn, directPath],
    }) as bigint[];
    
    if (amounts && amounts.length > 0 && amounts[amounts.length - 1] > 0n) {
      result.amountOut = amounts[amounts.length - 1].toString();
      result.path = directPath;
      result.priceImpact = 0.3;
      return result;
    }
  } catch {}
  
  // Try via WMON
  if (tokenIn.toLowerCase() !== WMON.toLowerCase() && tokenOut.toLowerCase() !== WMON.toLowerCase()) {
    try {
      const wmonPath = [tokenIn, WMON, tokenOut];
      const amounts = await publicClient.readContract({
        address: router,
        abi: V2_ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: [amountIn, wmonPath],
      }) as bigint[];
      
      if (amounts && amounts.length > 0 && amounts[amounts.length - 1] > 0n) {
        result.amountOut = amounts[amounts.length - 1].toString();
        result.path = wmonPath;
        result.priceImpact = 0.5;
        return result;
      }
    } catch {}
  }
  
  return result;
}

// Get quote from Uniswap V3 QuoterV2
async function getV3Quote(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint
): Promise<QuoteResult & { v3Fee?: number }> {
  const result: QuoteResult & { v3Fee?: number } = {
    dex: 'uniswap_v3',
    amountOut: '0',
    priceImpact: 0,
    router: DEX_CONFIG.uniswapV3.swapRouter,
    path: [tokenIn, tokenOut],
    v3Fee: 0,
  };
  
  // Try different fee tiers (100 = 0.01%, 500 = 0.05%, 3000 = 0.3%, 10000 = 1%)
  const feeTiers = [100, 500, 3000, 10000];
  
  for (const fee of feeTiers) {
    try {
      const quoteResult = await publicClient.readContract({
        address: DEX_CONFIG.uniswapV3.quoterV2,
        abi: V3_QUOTER_ABI,
        functionName: 'quoteExactInputSingle',
        args: [{
          tokenIn,
          tokenOut,
          amountIn,
          fee,
          sqrtPriceLimitX96: 0n,
        }],
      }) as [bigint, bigint, number, bigint];
      
      if (quoteResult && quoteResult[0] > 0n) {
        const amountOut = quoteResult[0];
        console.log(`[V3_QUOTE] fee=${fee}, amountOut=${amountOut}`);
        if (BigInt(result.amountOut) < amountOut) {
          result.amountOut = amountOut.toString();
          result.priceImpact = fee === 500 ? 0.05 : fee === 3000 ? 0.3 : 1;
          result.v3Fee = fee;
        }
      }
    } catch (e: any) {
      console.log(`[V3_QUOTE] fee=${fee} failed: ${e.message?.slice(0, 60)}`);
    }
  }
  
  return result;
}

// Get quote from Nad.Fun Lens (handles both bonding curve and graduated tokens)
async function getNadFunQuote(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint
): Promise<QuoteResult> {
  const result: QuoteResult = {
    dex: 'nadfun',
    amountOut: '0',
    priceImpact: 0,
    router: '',
    path: [tokenIn, tokenOut],
  };
  
  // Determine if buying (MON -> token) or selling (token -> MON)
  const isBuy = tokenIn.toLowerCase() === WMON.toLowerCase();
  const targetToken = isBuy ? tokenOut : tokenIn;
  
  try {
    const [router, amountOut] = await publicClient.readContract({
      address: DEX_CONFIG.nadfun.lens,
      abi: NADFUN_LENS_ABI,
      functionName: 'getAmountOut',
      args: [targetToken, amountIn, isBuy],
    }) as [Address, bigint];
    
    if (amountOut > 0n) {
      result.amountOut = amountOut.toString();
      result.router = router;
      result.priceImpact = 0.5;
    }
  } catch {}
  
  return result;
}

// Get price from on-chain DEX reserves
export async function getTokenPriceInMON(tokenAddress: Address): Promise<number> {
  try {
    // Get quote for 1 token -> WMON from all DEXes
    const decimals = await getDecimals(tokenAddress);
    const oneToken = parseUnits('1', decimals);
    
    const quotes = await Promise.all([
      getV2Quote(DEX_CONFIG.uniswapV2.router, 'uniswap_v2', tokenAddress, WMON, oneToken).catch(() => null),
      getV2Quote(DEX_CONFIG.pancakeswapV2.router, 'pancakeswap_v2', tokenAddress, WMON, oneToken).catch(() => null),
      getNadFunQuote(tokenAddress, WMON, oneToken).catch(() => null),
    ]);
    
    // Find best quote
    let bestAmountOut = 0n;
    for (const quote of quotes) {
      if (quote && quote.amountOut !== '0') {
        const amount = BigInt(quote.amountOut);
        if (amount > bestAmountOut) {
          bestAmountOut = amount;
        }
      }
    }
    
    if (bestAmountOut > 0n) {
      // Price in MON (18 decimals)
      return Number(formatUnits(bestAmountOut, 18));
    }
    
    return 0;
  } catch {
    return 0;
  }
}

// Get WMON price in USD from USDC pool
export async function getWMONPriceUSD(): Promise<number> {
  try {
    const oneWMON = parseUnits('1', 18);
    
    // Get quote for 1 WMON -> USDC
    const quote = await getV2Quote(DEX_CONFIG.uniswapV2.router, 'uniswap_v2', WMON, USDC, oneWMON);
    
    if (quote.amountOut !== '0') {
      // USDC has 6 decimals
      return Number(formatUnits(BigInt(quote.amountOut), 6));
    }
    
    // Try PancakeSwap
    const psQuote = await getV2Quote(DEX_CONFIG.pancakeswapV2.router, 'pancakeswap_v2', WMON, USDC, oneWMON);
    if (psQuote.amountOut !== '0') {
      return Number(formatUnits(BigInt(psQuote.amountOut), 6));
    }
    
    return 0;
  } catch {
    return 0;
  }
}

// Get token price in USD directly from USDC pool (for major tokens like WETH)
async function getDirectUSDCPrice(tokenAddress: Address): Promise<number> {
  try {
    const decimals = await getDecimals(tokenAddress);
    const oneToken = parseUnits('1', decimals);
    
    // Try V3 quoter with different fee tiers for TOKEN → USDC
    const feeTiers = [500, 3000, 10000];
    let bestPrice = 0;
    
    for (const fee of feeTiers) {
      try {
        const quoteResult = await publicClient.readContract({
          address: DEX_CONFIG.uniswapV3.quoterV2,
          abi: V3_QUOTER_ABI,
          functionName: 'quoteExactInputSingle',
          args: [{
            tokenIn: tokenAddress,
            tokenOut: USDC,
            amountIn: oneToken,
            fee,
            sqrtPriceLimitX96: 0n,
          }],
        }) as [bigint, bigint, number, bigint];
        
        if (quoteResult && quoteResult[0] > 0n) {
          const price = Number(formatUnits(quoteResult[0], 6));
          if (price > bestPrice) {
            bestPrice = price;
          }
        }
      } catch {}
    }
    
    // Also try V2 routers
    if (bestPrice === 0) {
      const v2Quote = await getV2Quote(DEX_CONFIG.uniswapV2.router, 'uniswap_v2', tokenAddress, USDC, oneToken);
      if (v2Quote.amountOut !== '0') {
        bestPrice = Number(formatUnits(BigInt(v2Quote.amountOut), 6));
      }
    }
    
    return bestPrice;
  } catch {
    return 0;
  }
}

// Get token price in USD
export async function getTokenPriceUSD(tokenAddress: Address): Promise<number> {
  try {
    // If it's WMON, get direct USD price
    if (tokenAddress.toLowerCase() === WMON.toLowerCase()) {
      return await getWMONPriceUSD();
    }
    
    // If it's USDC/USDT, return 1
    if (tokenAddress.toLowerCase() === USDC.toLowerCase() || 
        tokenAddress.toLowerCase() === '0x98cba48cfb0573e1635ae00d8b3b43b4fad844d6') {
      return 1;
    }
    
    // For WETH and other major tokens - try direct USDC pool first
    if (tokenAddress.toLowerCase() === WETH.toLowerCase()) {
      const directPrice = await getDirectUSDCPrice(tokenAddress);
      if (directPrice > 0) {
        return directPrice;
      }
    }
    
    // For any token - try direct USDC pool first (prioritize stablecoin pairs)
    const directPrice = await getDirectUSDCPrice(tokenAddress);
    if (directPrice > 0) {
      return directPrice;
    }
    
    // Fallback: Get token price in MON, then convert to USD
    const priceInMON = await getTokenPriceInMON(tokenAddress);
    if (priceInMON > 0) {
      const monPriceUSD = await getWMONPriceUSD();
      return priceInMON * monPriceUSD;
    }
    
    return 0;
  } catch {
    return 0;
  }
}

// Native MON address (for native token swaps)
const NATIVE_MON = '0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE' as Address;

// Get all swap quotes from all DEXes
export async function getAllSwapQuotes(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint
): Promise<SwapQuotes> {
  const tokenInLower = tokenIn.toLowerCase();
  const tokenOutLower = tokenOut.toLowerCase();
  const wmonLower = WMON.toLowerCase();
  const nativeLower = NATIVE_MON.toLowerCase();
  
  // Special case: MON ↔ WMON (1:1 wrap/unwrap)
  const isMonToWmon = (tokenInLower === nativeLower && tokenOutLower === wmonLower);
  const isWmonToMon = (tokenInLower === wmonLower && tokenOutLower === nativeLower);
  
  if (isMonToWmon || isWmonToMon) {
    const wrapQuote: QuoteResult = {
      dex: isMonToWmon ? 'wrap' : 'unwrap',
      amountOut: amountIn.toString(),
      priceImpact: 0,
      router: WMON,
      path: [tokenIn, tokenOut],
    };
    
    return {
      tokenIn,
      tokenOut,
      amountIn: amountIn.toString(),
      quotes: [wrapQuote],
      bestQuote: wrapQuote,
    };
  }
  
  // For normal swaps with native MON, use WMON instead
  const effectiveTokenIn = tokenInLower === nativeLower ? WMON : tokenIn;
  const effectiveTokenOut = tokenOutLower === nativeLower ? WMON : tokenOut;
  
  // Fetch quotes from all DEXes in parallel - SwapAggregatorV3 supports both V2 and V3
  const [uniV2Quote, uniV3Quote, psQuote, nadfunQuote] = await Promise.all([
    getV2Quote(DEX_CONFIG.uniswapV2.router, 'uniswap_v2', effectiveTokenIn, effectiveTokenOut, amountIn).catch(() => ({
      dex: 'uniswap_v2', amountOut: '0', priceImpact: 0, router: DEX_CONFIG.uniswapV2.router, path: []
    })),
    getV3Quote(effectiveTokenIn, effectiveTokenOut, amountIn).catch(() => ({
      dex: 'uniswap_v3', amountOut: '0', priceImpact: 0, router: DEX_CONFIG.uniswapV3.swapRouter, path: [], v3Fee: 0
    })),
    getV2Quote(DEX_CONFIG.pancakeswapV2.router, 'pancakeswap_v2', effectiveTokenIn, effectiveTokenOut, amountIn).catch(() => ({
      dex: 'pancakeswap_v2', amountOut: '0', priceImpact: 0, router: DEX_CONFIG.pancakeswapV2.router, path: []
    })),
    getNadFunQuote(effectiveTokenIn, effectiveTokenOut, amountIn).catch(() => ({
      dex: 'nadfun', amountOut: '0', priceImpact: 0, router: '', path: []
    })),
  ]);

  const allQuotes = [uniV2Quote, uniV3Quote, psQuote, nadfunQuote];
  const validQuotes = allQuotes.filter(q => q.amountOut !== '0');
  
  // Find best quote
  const bestQuote = validQuotes.length > 0
    ? validQuotes.reduce((best, current) => 
        BigInt(current.amountOut) > BigInt(best.amountOut) ? current : best
      )
    : { dex: 'none', amountOut: '0', priceImpact: 0, router: '', path: [] };

  return {
    tokenIn,
    tokenOut,
    amountIn: amountIn.toString(),
    quotes: allQuotes,
    bestQuote,
  };
}

// Export DEX config for use in routes
export { DEX_CONFIG, WMON, USDC };
