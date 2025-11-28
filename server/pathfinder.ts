import { createPublicClient, http, parseAbi, formatUnits, parseUnits } from 'viem';

const WMON = '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A';
const USDC = '0x754704Bc059F8C67012fEd69BC8A327a5aafb603';
const WETH = '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242';
const UNISWAP_V2 = '0x4B2ab38DBF28D31D467aA8993f6c2585981D6804';
const PANCAKE_V2 = '0xB1Bc24c34e88f7D43D5923034E3a14B24DaACfF9';
const UNISWAP_V3_QUOTER = '0x661E93cca42AfacB172121EF892830cA3b70F08d';
const UNISWAP_V3_FACTORY = '0x204faca1764b154221e35c0d20abb3c525710498';
const NADFUN_LENS = '0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea';
const NADFUN_DEX_FACTORY = '0x6B5F564339DbAD6b780249827f2198a841FEB7F3';

const V3_FEE_TIERS = [500, 3000, 10000, 100];

export interface SwapRoute {
  dexId: number;
  dexName: string;
  amountIn: string;
  expectedOut: string;
  minOut: string;
  percentage: number;
  v3Fee: number;
  isGraduated: boolean;
}

export interface PathfinderResult {
  routes: SwapRoute[];
  totalExpectedOut: string;
  totalMinOut: string;
  priceImpact: number;
  bestSingleDex: string;
  isSplitBetter: boolean;
}

interface DexQuote {
  dexId: number;
  dexName: string;
  amountOut: bigint;
  v3Fee: number;
  isGraduated: boolean;
  hasLiquidity: boolean;
}

const client = createPublicClient({
  chain: { 
    id: 143, 
    name: 'Monad', 
    nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
    rpcUrls: { default: { http: ['https://rpc3.monad.xyz/'] } }
  },
  transport: http('https://rpc3.monad.xyz/')
});

const v2RouterAbi = parseAbi([
  'function getAmountsOut(uint amountIn, address[] memory path) external view returns (uint[] memory amounts)',
]);

const v3QuoterAbi = parseAbi([
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
]);

const v3FactoryAbi = parseAbi([
  'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)',
]);

const v3PoolAbi = parseAbi([
  'function liquidity() external view returns (uint128)',
]);

const nadFunLensAbi = parseAbi([
  'function isGraduated(address token) external view returns (bool)',
  'function getAmountOut(address token, uint256 amountIn, bool isBuy) external view returns (address router, uint256 amountOut)',
]);

async function getV2Quote(router: string, tokenIn: string, tokenOut: string, amountIn: bigint): Promise<bigint> {
  try {
    const amounts = await client.readContract({
      address: router as `0x${string}`,
      abi: v2RouterAbi,
      functionName: 'getAmountsOut',
      args: [amountIn, [tokenIn as `0x${string}`, tokenOut as `0x${string}`]],
    });
    console.log(`[V2] ${router.slice(0,10)}... ${tokenIn.slice(0,10)}→${tokenOut.slice(0,10)} amt=${amountIn.toString().slice(0,10)}... out=${amounts[1]}`);
    return amounts[1];
  } catch (e: any) {
    console.log(`[V2] ${router.slice(0,10)}... FAILED: ${e?.message?.slice(0,50) || 'unknown'}`);
    return 0n;
  }
}

async function getV3Quote(tokenIn: string, tokenOut: string, amountIn: bigint, fee: number, factory: string = UNISWAP_V3_FACTORY): Promise<bigint> {
  try {
    const result = await client.readContract({
      address: UNISWAP_V3_QUOTER as `0x${string}`,
      abi: v3QuoterAbi,
      functionName: 'quoteExactInputSingle',
      args: [{
        tokenIn: tokenIn as `0x${string}`,
        tokenOut: tokenOut as `0x${string}`,
        amountIn: amountIn,
        fee: fee,
        sqrtPriceLimitX96: 0n,
      }],
    });

    const amountOut = (result as any)[0] as bigint;
    if (amountOut > 0n) {
      console.log(`[V3] fee=${fee} ${tokenIn.slice(0,10)}→${tokenOut.slice(0,10)} out=${amountOut}`);
    }
    return amountOut > 0n ? amountOut : 0n;
  } catch (e: any) {
    console.log(`[V3] fee=${fee} ${tokenIn.slice(0,10)}→${tokenOut.slice(0,10)} FAILED: ${e?.message?.slice(0,50) || 'unknown'}`);
    return 0n;
  }
}

async function getMultiHopV3Quote(tokenIn: string, tokenOut: string, amountIn: bigint, hopToken: string, fee1: number, fee2: number): Promise<bigint> {
  try {
    const hop1 = await getV3Quote(tokenIn, hopToken, amountIn, fee1);
    if (hop1 === 0n) return 0n;
    const hop2 = await getV3Quote(hopToken, tokenOut, hop1, fee2);
    console.log(`[MULTIHOP V3] ${tokenIn.slice(0,8)}→${hopToken.slice(0,8)}→${tokenOut.slice(0,8)} = ${hop2}`);
    return hop2;
  } catch {
    return 0n;
  }
}

async function getNadFunQuote(token: string, amountIn: bigint, isBuy: boolean): Promise<{ amountOut: bigint; isGraduated: boolean; v3Fee: number }> {
  try {
    const isGraduated = await client.readContract({
      address: NADFUN_LENS as `0x${string}`,
      abi: nadFunLensAbi,
      functionName: 'isGraduated',
      args: [token as `0x${string}`],
    });

    if (isGraduated) {
      // Try Nad.Fun DEX factory first for graduated tokens
      for (const fee of V3_FEE_TIERS) {
        const quote = await getV3Quote(isBuy ? WMON : token, isBuy ? token : WMON, amountIn, fee, NADFUN_DEX_FACTORY);
        if (quote > 0n) {
          return { amountOut: quote, isGraduated: true, v3Fee: fee };
        }
      }
      // Also try Uniswap V3 factory for graduated tokens
      for (const fee of V3_FEE_TIERS) {
        const quote = await getV3Quote(isBuy ? WMON : token, isBuy ? token : WMON, amountIn, fee, UNISWAP_V3_FACTORY);
        if (quote > 0n) {
          return { amountOut: quote, isGraduated: true, v3Fee: fee };
        }
      }
    }

    const result = await client.readContract({
      address: NADFUN_LENS as `0x${string}`,
      abi: nadFunLensAbi,
      functionName: 'getAmountOut',
      args: [token as `0x${string}`, amountIn, isBuy],
    });

    return { amountOut: result[1], isGraduated, v3Fee: 0 };
  } catch {
    return { amountOut: 0n, isGraduated: false, v3Fee: 0 };
  }
}

async function getAllQuotes(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  isBuyMON: boolean
): Promise<DexQuote[]> {
  const quotes: DexQuote[] = [];
  
  // Convert native MON address to WMON for DEX queries
  const NATIVE_MON = '0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE';
  const actualTokenIn = tokenIn.toLowerCase() === NATIVE_MON.toLowerCase() ? WMON : tokenIn;
  const actualTokenOut = tokenOut.toLowerCase() === NATIVE_MON.toLowerCase() ? WMON : tokenOut;
  
  // The non-WMON token is our target for Nad.Fun check
  const targetToken = actualTokenIn.toLowerCase() === WMON.toLowerCase() ? actualTokenOut : actualTokenIn;
  const isBuyingToken = actualTokenIn.toLowerCase() === WMON.toLowerCase();
  
  // V3-ONLY tokens - skip V2 and Nad.Fun for these tokens (better liquidity on V3)
  const V3_ONLY_TOKENS = [
    '0x350035555e10d9afaf1566aaebfced5ba6c27777', // CHOG
  ];
  const isV3OnlyToken = V3_ONLY_TOKENS.includes(targetToken.toLowerCase());

  // 1. V3 PRIORITY - Check ALL Uniswap V3 fee tiers and keep the BEST
  const v3Quotes: { fee: number; amountOut: bigint }[] = [];
  await Promise.all(
    V3_FEE_TIERS.map(async (fee) => {
      try {
        const v3Quote = await getV3Quote(actualTokenIn, actualTokenOut, amountIn, fee);
        if (v3Quote > 0n) {
          v3Quotes.push({ fee, amountOut: v3Quote });
        }
      } catch {}
    })
  );
  
  if (v3Quotes.length > 0) {
    const bestV3 = v3Quotes.reduce((best, curr) => curr.amountOut > best.amountOut ? curr : best);
    quotes.push({
      dexId: 2,
      dexName: `Uniswap V3 (${bestV3.fee / 100 === 1 ? '0.01' : bestV3.fee / 100 === 5 ? '0.05' : bestV3.fee / 100 === 30 ? '0.3' : '1'}%)`,
      amountOut: bestV3.amountOut,
      v3Fee: bestV3.fee,
      isGraduated: false,
      hasLiquidity: true,
    });
  }

  // 2. Check V2 DEXes in parallel (skip for V3-only tokens)
  if (!isV3OnlyToken) {
    const [uniV2Quote, pancakeQuote] = await Promise.all([
      getV2Quote(UNISWAP_V2, actualTokenIn, actualTokenOut, amountIn).catch(() => 0n),
      getV2Quote(PANCAKE_V2, actualTokenIn, actualTokenOut, amountIn).catch(() => 0n),
    ]);

    if (uniV2Quote > 0n) {
      quotes.push({
        dexId: 0,
        dexName: 'Uniswap V2',
        amountOut: uniV2Quote,
        v3Fee: 0,
        isGraduated: false,
        hasLiquidity: true,
      });
    }

    if (pancakeQuote > 0n) {
      quotes.push({
        dexId: 1,
        dexName: 'PancakeSwap V2',
        amountOut: pancakeQuote,
        v3Fee: 0,
        isGraduated: false,
        hasLiquidity: true,
      });
    }
  } else {
    console.log(`[PATHFINDER] V3-only token detected: ${targetToken.substring(0,10)}... - skipping V2`);
  }

  // 3. Check Nad.Fun for any non-WMON token (skip for V3-only tokens)
  if (!isV3OnlyToken && targetToken.toLowerCase() !== WMON.toLowerCase()) {
    try {
      console.log(`[NADFUN] Checking token ${targetToken}, isBuy: ${isBuyingToken}`);
      const nadFunResult = await getNadFunQuote(targetToken, amountIn, isBuyingToken);
      console.log(`[NADFUN] Result: amountOut=${nadFunResult.amountOut}, isGraduated=${nadFunResult.isGraduated}`);
      if (nadFunResult.amountOut > 0n) {
        quotes.push({
          dexId: 3,
          dexName: nadFunResult.isGraduated ? 'Nad.Fun (Graduated)' : 'Nad.Fun (Bonding)',
          amountOut: nadFunResult.amountOut,
          v3Fee: nadFunResult.v3Fee,
          isGraduated: nadFunResult.isGraduated,
          hasLiquidity: true,
        });
      }
    } catch (e) {
      console.log(`[NADFUN] Error: ${e}`);
    }
  }

  // NOTE: Multi-hop routing is disabled because contract doesn't support dexId 4
  // The contract only supports: 0 (Uniswap V2), 1 (PancakeSwap V2), 2 (Uniswap V3), 3 (Nad.Fun)
  // Multi-hop would need a contract upgrade to support path-based routing
  
  return quotes.sort((a, b) => (b.amountOut > a.amountOut ? 1 : -1));
}

function calculateOptimalSplit(
  quotes: DexQuote[],
  totalAmountIn: bigint,
  slippageBps: number = 100
): SwapRoute[] {
  if (quotes.length === 0) return [];

  if (quotes.length === 1) {
    const q = quotes[0];
    const minOut = (q.amountOut * BigInt(10000 - slippageBps)) / 10000n;
    return [{
      dexId: q.dexId,
      dexName: q.dexName,
      amountIn: totalAmountIn.toString(),
      expectedOut: q.amountOut.toString(),
      minOut: minOut.toString(),
      percentage: 100,
      v3Fee: q.v3Fee,
      isGraduated: q.isGraduated,
    }];
  }

  const bestQuote = quotes[0];
  const secondBest = quotes[1];

  const bestEfficiency = Number(bestQuote.amountOut) / Number(totalAmountIn);
  const secondEfficiency = Number(secondBest.amountOut) / Number(totalAmountIn);

  if (bestEfficiency > secondEfficiency * 1.02) {
    const minOut = (bestQuote.amountOut * BigInt(10000 - slippageBps)) / 10000n;
    return [{
      dexId: bestQuote.dexId,
      dexName: bestQuote.dexName,
      amountIn: totalAmountIn.toString(),
      expectedOut: bestQuote.amountOut.toString(),
      minOut: minOut.toString(),
      percentage: 100,
      v3Fee: bestQuote.v3Fee,
      isGraduated: bestQuote.isGraduated,
    }];
  }

  const routes: SwapRoute[] = [];
  const splitPercentages = [70, 30];
  
  for (let i = 0; i < Math.min(2, quotes.length); i++) {
    const q = quotes[i];
    const pct = splitPercentages[i];
    const splitAmount = (totalAmountIn * BigInt(pct)) / 100n;
    const expectedOut = (q.amountOut * BigInt(pct)) / 100n;
    const minOut = (expectedOut * BigInt(10000 - slippageBps)) / 10000n;
    
    routes.push({
      dexId: q.dexId,
      dexName: q.dexName,
      amountIn: splitAmount.toString(),
      expectedOut: expectedOut.toString(),
      minOut: minOut.toString(),
      percentage: pct,
      v3Fee: q.v3Fee,
      isGraduated: q.isGraduated,
    });
  }

  return routes;
}

export async function findBestPath(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  slippageBps: number = 100,
  tokenInDecimals: number = 18
): Promise<PathfinderResult> {
  const NATIVE_MON = '0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE';
  const isNativeMON = tokenIn.toLowerCase() === NATIVE_MON.toLowerCase();
  const isNativeMONOut = tokenOut.toLowerCase() === NATIVE_MON.toLowerCase();
  const isWMONIn = tokenIn.toLowerCase() === WMON.toLowerCase();
  const isWMONOut = tokenOut.toLowerCase() === WMON.toLowerCase();
  
  // Use 18 decimals for native MON/WMON, otherwise use passed decimals
  const effectiveDecimals = (isNativeMON || isWMONIn) ? 18 : tokenInDecimals;
  const amountInWei = parseUnits(amountIn, effectiveDecimals);
  console.log(`[PATHFINDER] Amount: ${amountIn} with ${effectiveDecimals} decimals = ${amountInWei} wei`);
  
  // Special case: MON <-> WMON is a wrap/unwrap, not a DEX swap (1:1 ratio)
  if ((isNativeMON && isWMONOut) || (isWMONIn && isNativeMONOut)) {
    const minOut = (amountInWei * BigInt(10000 - slippageBps)) / 10000n;
    return {
      routes: [{
        dexId: 99, // Special ID for wrap/unwrap
        dexName: isNativeMON ? 'Wrap MON' : 'Unwrap WMON',
        amountIn: amountInWei.toString(),
        expectedOut: amountInWei.toString(), // 1:1 ratio
        minOut: minOut.toString(),
        percentage: 100,
        v3Fee: 0,
        isGraduated: false,
      }],
      totalExpectedOut: amountInWei.toString(),
      totalMinOut: minOut.toString(),
      priceImpact: 0,
      bestSingleDex: isNativeMON ? 'Wrap MON' : 'Unwrap WMON',
      isSplitBetter: false,
    };
  }
  
  const isBuyMON = tokenOut.toLowerCase() === WMON.toLowerCase();

  // For MON → Token swaps, contract takes 1% fee upfront
  // Routes need to sum to (amountIn - 1% fee)
  const feeBps = 100n; // 1% = 100 basis points
  const effectiveAmountIn = isNativeMON 
    ? amountInWei - (amountInWei * feeBps / 10000n)
    : amountInWei;

  const quotes = await getAllQuotes(tokenIn, tokenOut, effectiveAmountIn, isBuyMON);

  if (quotes.length === 0) {
    return {
      routes: [],
      totalExpectedOut: '0',
      totalMinOut: '0',
      priceImpact: 0,
      bestSingleDex: 'None',
      isSplitBetter: false,
    };
  }

  const routes = calculateOptimalSplit(quotes, effectiveAmountIn, slippageBps);
  
  const totalExpectedOut = routes.reduce((sum, r) => sum + BigInt(r.expectedOut), 0n);
  const totalMinOut = routes.reduce((sum, r) => sum + BigInt(r.minOut), 0n);
  
  const bestSingleOut = quotes[0].amountOut;
  const isSplitBetter = routes.length > 1 && totalExpectedOut > bestSingleOut;

  // Estimate price impact based on trade size relative to typical liquidity
  // This is a rough estimate - actual impact depends on pool depth
  let priceImpact = 0;
  const amountInMON = Number(effectiveAmountIn) / 1e18;
  if (amountInMON > 1000) {
    // Larger trades have more price impact
    priceImpact = Math.min(5, amountInMON / 1000 * 0.5);
  } else if (amountInMON > 100) {
    priceImpact = Math.min(1, amountInMON / 100 * 0.1);
  }
  // For V3 pools with concentrated liquidity, impact is usually lower

  return {
    routes,
    totalExpectedOut: totalExpectedOut.toString(),
    totalMinOut: totalMinOut.toString(),
    priceImpact: Math.round(priceImpact * 100) / 100, // Round to 2 decimal places
    bestSingleDex: quotes[0].dexName,
    isSplitBetter,
  };
}

export async function isNadFunToken(token: string): Promise<{ isNadFun: boolean; isGraduated: boolean; v3Fee: number }> {
  try {
    const isGraduated = await client.readContract({
      address: NADFUN_LENS as `0x${string}`,
      abi: nadFunLensAbi,
      functionName: 'isGraduated',
      args: [token as `0x${string}`],
    });

    if (isGraduated) {
      for (const fee of V3_FEE_TIERS) {
        try {
          const pool = await client.readContract({
            address: NADFUN_DEX_FACTORY as `0x${string}`,
            abi: v3FactoryAbi,
            functionName: 'getPool',
            args: [token as `0x${string}`, WMON as `0x${string}`, fee],
          });
          if (pool !== '0x0000000000000000000000000000000000000000') {
            return { isNadFun: true, isGraduated: true, v3Fee: fee };
          }
        } catch {}
      }
    }

    try {
      const result = await client.readContract({
        address: NADFUN_LENS as `0x${string}`,
        abi: nadFunLensAbi,
        functionName: 'getAmountOut',
        args: [token as `0x${string}`, parseUnits('0.001', 18), true],
      });
      if (result[1] > 0n) {
        return { isNadFun: true, isGraduated: false, v3Fee: 0 };
      }
    } catch {}

    return { isNadFun: false, isGraduated: false, v3Fee: 0 };
  } catch {
    return { isNadFun: false, isGraduated: false, v3Fee: 0 };
  }
}
