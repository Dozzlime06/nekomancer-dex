import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createPublicClient, http, parseAbi, parseUnits, formatUnits } from 'viem';

const RPC_URL = 'https://rpc3.monad.xyz/';
const WMON = '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A';
const NATIVE_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

const UNISWAP_V2_ROUTER = '0x4B2ab38DBF28D31D467aA8993f6c2585981D6804';
const PANCAKE_V2_ROUTER = '0xB1Bc24c34e88f7D43D5923034E3a14B24DaACfF9';
const UNISWAP_V3_QUOTER = '0x661E93cca42AfacB172121EF892830cA3b70F08d';
const NADFUN_LENS = '0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea';

const V2_ROUTER_ABI = parseAbi([
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
]);

const V3_QUOTER_ABI = parseAbi([
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
]);

const NADFUN_LENS_ABI = parseAbi([
  'function getAmountOut(address _token, uint256 _amountIn, bool _isBuy) external view returns (address router, uint256 amountOut)',
  'function isGraduated(address _token) external view returns (bool)',
]);

const ERC20_ABI = parseAbi([
  'function decimals() view returns (uint8)',
]);

async function getTokenDecimals(client: any, address: string): Promise<number> {
  if (address.toLowerCase() === NATIVE_TOKEN.toLowerCase()) return 18;
  if (address.toLowerCase() === WMON.toLowerCase()) return 18;
  try {
    const decimals = await client.readContract({
      address: address as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'decimals',
    });
    return Number(decimals);
  } catch {
    return 18;
  }
}

interface QuoteResult {
  dex: string;
  dexId: number;
  amountOut: bigint;
  fee?: number;
  path: string[];
  isGraduated?: boolean;
}

async function getV2Quote(client: any, router: string, dexName: string, dexId: number, tokenIn: string, tokenOut: string, amountIn: bigint): Promise<QuoteResult | null> {
  try {
    const path = [tokenIn, tokenOut];
    const amounts = await client.readContract({
      address: router as `0x${string}`,
      abi: V2_ROUTER_ABI,
      functionName: 'getAmountsOut',
      args: [amountIn, path as `0x${string}`[]],
    }) as bigint[];
    
    if (amounts[1] > 0n) {
      return { dex: dexName, dexId, amountOut: amounts[1], path };
    }
  } catch {}
  return null;
}

async function getV3Quote(client: any, tokenIn: string, tokenOut: string, amountIn: bigint): Promise<QuoteResult | null> {
  let bestResult: QuoteResult | null = null;
  
  for (const fee of [100, 500, 3000, 10000]) {
    try {
      const result = await client.simulateContract({
        address: UNISWAP_V3_QUOTER as `0x${string}`,
        abi: V3_QUOTER_ABI,
        functionName: 'quoteExactInputSingle',
        args: [{
          tokenIn: tokenIn as `0x${string}`,
          tokenOut: tokenOut as `0x${string}`,
          amountIn,
          fee,
          sqrtPriceLimitX96: 0n,
        }],
      });
      const amountOut = (result.result as any)[0] as bigint;
      if (amountOut > 0n && (!bestResult || amountOut > bestResult.amountOut)) {
        bestResult = { 
          dex: 'Uniswap V3', 
          dexId: 2,
          amountOut, 
          fee,
          path: [tokenIn, tokenOut]
        };
      }
    } catch {}
  }
  return bestResult;
}

async function getNadFunQuote(client: any, token: string, amountIn: bigint, isBuy: boolean): Promise<QuoteResult | null> {
  try {
    // First check if token is graduated - graduated tokens use V3, not Nad.Fun bonding
    const isGraduated = await client.readContract({
      address: NADFUN_LENS as `0x${string}`,
      abi: NADFUN_LENS_ABI,
      functionName: 'isGraduated',
      args: [token as `0x${string}`],
    }).catch(() => false);
    
    // Skip Nad.Fun for graduated tokens - they should use V3
    if (isGraduated) {
      console.log('[NADFUN] Token is graduated, skipping Nad.Fun quote:', token);
      return null;
    }
    
    const quoteResult = await client.readContract({
      address: NADFUN_LENS as `0x${string}`,
      abi: NADFUN_LENS_ABI,
      functionName: 'getAmountOut',
      args: [token as `0x${string}`, amountIn, isBuy],
    });
    
    const amountOut = (quoteResult as any)[1] as bigint;
    if (amountOut > 0n) {
      return {
        dex: 'Nad.Fun',
        dexId: 3,
        amountOut,
        path: isBuy ? [WMON, token] : [token, WMON],
        isGraduated: false,
      };
    }
  } catch {}
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { tokenIn, tokenOut, amountIn, slippageBps = 100, tokenInDecimals } = req.body || req.query;
    
    if (!tokenIn || !tokenOut || !amountIn) {
      return res.status(400).json({ error: 'Missing parameters: tokenIn, tokenOut, amountIn required' });
    }

    const client = createPublicClient({ transport: http(RPC_URL) });
    
    const inDecimals = tokenInDecimals ? Number(tokenInDecimals) : await getTokenDecimals(client, tokenIn);
    const outDecimals = await getTokenDecimals(client, tokenOut);
    
    const inputAmount = parseUnits(String(amountIn), inDecimals);
    
    const isFromNative = tokenIn.toLowerCase() === NATIVE_TOKEN.toLowerCase();
    const isToNative = tokenOut.toLowerCase() === NATIVE_TOKEN.toLowerCase();
    const isFromWMON = tokenIn.toLowerCase() === WMON.toLowerCase();
    const isToWMON = tokenOut.toLowerCase() === WMON.toLowerCase();
    
    // Handle wrap/unwrap
    if ((isFromNative && isToWMON) || (isFromWMON && isToNative)) {
      const formattedOut = formatUnits(inputAmount, outDecimals);
      const slippageMultiplier = 10000n - BigInt(slippageBps);
      const minAmountOut = (inputAmount * slippageMultiplier) / 10000n;
      
      return res.status(200).json({
        routes: [{
          dex: isFromNative ? 'Wrap MON' : 'Unwrap WMON',
          dexId: 4,
          dexName: isFromNative ? 'Wrap MON' : 'Unwrap WMON',
          path: [tokenIn, tokenOut],
          percentage: 100,
          amountIn: amountIn.toString(),
          amountOut: formattedOut,
          expectedOut: inputAmount.toString(),
          minOut: minAmountOut.toString(),
          rawAmountOut: inputAmount.toString(),
          fee: 0,
          v3Fee: 0,
        }],
        totalAmountOut: inputAmount.toString(),
        totalMinOut: minAmountOut.toString(),
        bestDex: isFromNative ? 'Wrap MON' : 'Unwrap WMON',
        bestSingleDex: isFromNative ? 'Wrap MON' : 'Unwrap WMON',
        priceImpact: 0,
        formattedAmountOut: formattedOut,
      });
    }
    
    const fromAddr = isFromNative ? WMON : tokenIn;
    const toAddr = isToNative ? WMON : tokenOut;
    
    // Determine if this is a buy (MON→Token) or sell (Token→MON)
    const isBuyingToken = fromAddr.toLowerCase() === WMON.toLowerCase();
    const targetToken = isBuyingToken ? toAddr : fromAddr;

    const quotes: QuoteResult[] = [];

    // Get all quotes in parallel
    const [uniV2, pancakeV2, uniV3, nadFun] = await Promise.all([
      getV2Quote(client, UNISWAP_V2_ROUTER, 'Uniswap V2', 0, fromAddr, toAddr, inputAmount),
      getV2Quote(client, PANCAKE_V2_ROUTER, 'PancakeSwap V2', 1, fromAddr, toAddr, inputAmount),
      getV3Quote(client, fromAddr, toAddr, inputAmount),
      // Only check Nad.Fun for MON↔Token swaps (not Token↔Token)
      (fromAddr.toLowerCase() === WMON.toLowerCase() || toAddr.toLowerCase() === WMON.toLowerCase())
        ? getNadFunQuote(client, targetToken, inputAmount, isBuyingToken)
        : Promise.resolve(null),
    ]);

    if (uniV2) quotes.push(uniV2);
    if (pancakeV2) quotes.push(pancakeV2);
    if (uniV3) quotes.push(uniV3);
    if (nadFun) quotes.push(nadFun);

    if (quotes.length === 0) {
      return res.status(200).json({
        routes: [],
        totalAmountOut: '0',
        totalMinOut: '0',
        bestDex: null,
        priceImpact: '0',
      });
    }

    // Sort by best output
    quotes.sort((a, b) => (b.amountOut > a.amountOut ? 1 : -1));
    const best = quotes[0];
    
    const slippageMultiplier = 10000n - BigInt(slippageBps);
    const minAmountOut = (best.amountOut * slippageMultiplier) / 10000n;

    const formattedOut = formatUnits(best.amountOut, outDecimals);
    
    const route = {
      dex: best.dex,
      dexId: best.dexId,
      dexName: best.dex,
      path: best.path,
      percentage: 100,
      amountIn: amountIn.toString(),
      amountOut: formattedOut,
      expectedOut: best.amountOut.toString(),
      minOut: minAmountOut.toString(),
      rawAmountOut: best.amountOut.toString(),
      fee: best.fee || 0,
      v3Fee: best.fee || 3000,
      isGraduated: best.isGraduated || false,
    };

    return res.status(200).json({
      routes: [route],
      totalAmountOut: best.amountOut.toString(),
      totalMinOut: minAmountOut.toString(),
      bestDex: best.dex,
      bestSingleDex: best.dex,
      priceImpact: 0.1,
      formattedAmountOut: formattedOut,
    });
  } catch (error: any) {
    console.error('Pathfinder error:', error);
    return res.status(500).json({ error: error.message });
  }
}
