import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createPublicClient, http, parseAbi, parseUnits, formatUnits } from 'viem';

const RPC_URL = 'https://rpc3.monad.xyz/';
const WMON = '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A';
const NATIVE_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

const UNISWAP_V2_ROUTER = '0x4B2ab38DBF28D31D467aA8993f6c2585981D6804';
const PANCAKE_V2_ROUTER = '0xB1Bc24c34e88f7D43D5923034E3a14B24DaACfF9';
const UNISWAP_V3_QUOTER = '0x661E93cca42AfacB172121EF892830cA3b70F08d';

const V2_ROUTER_ABI = parseAbi([
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
]);

const V3_QUOTER_ABI = parseAbi([
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
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
  amountOut: bigint;
  fee?: number;
  path: string[];
}

async function getV2Quote(client: any, router: string, dexName: string, tokenIn: string, tokenOut: string, amountIn: bigint): Promise<QuoteResult | null> {
  try {
    const path = [tokenIn, tokenOut];
    const amounts = await client.readContract({
      address: router as `0x${string}`,
      abi: V2_ROUTER_ABI,
      functionName: 'getAmountsOut',
      args: [amountIn, path as `0x${string}`[]],
    }) as bigint[];
    
    if (amounts[1] > 0n) {
      return { dex: dexName, amountOut: amounts[1], path };
    }
  } catch {}
  return null;
}

async function getV3Quote(client: any, tokenIn: string, tokenOut: string, amountIn: bigint): Promise<QuoteResult | null> {
  let bestResult: QuoteResult | null = null;
  
  for (const fee of [500, 3000, 10000]) {
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
          dex: 'uniswap_v3', 
          amountOut, 
          fee,
          path: [tokenIn, tokenOut]
        };
      }
    } catch {}
  }
  return bestResult;
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
    
    const fromAddr = tokenIn.toLowerCase() === NATIVE_TOKEN.toLowerCase() ? WMON : tokenIn;
    const toAddr = tokenOut.toLowerCase() === NATIVE_TOKEN.toLowerCase() ? WMON : tokenOut;

    const quotes: QuoteResult[] = [];

    const [uniV2, pancakeV2, uniV3] = await Promise.all([
      getV2Quote(client, UNISWAP_V2_ROUTER, 'uniswap_v2', fromAddr, toAddr, inputAmount),
      getV2Quote(client, PANCAKE_V2_ROUTER, 'pancakeswap_v2', fromAddr, toAddr, inputAmount),
      getV3Quote(client, fromAddr, toAddr, inputAmount),
    ]);

    if (uniV2) quotes.push(uniV2);
    if (pancakeV2) quotes.push(pancakeV2);
    if (uniV3) quotes.push(uniV3);

    if (quotes.length === 0) {
      return res.status(200).json({
        routes: [],
        totalAmountOut: '0',
        totalMinOut: '0',
        bestDex: null,
        priceImpact: '0',
      });
    }

    quotes.sort((a, b) => (b.amountOut > a.amountOut ? 1 : -1));
    const best = quotes[0];
    
    const slippageMultiplier = 10000n - BigInt(slippageBps);
    const minAmountOut = (best.amountOut * slippageMultiplier) / 10000n;

    const formattedOut = formatUnits(best.amountOut, outDecimals);
    
    const route = {
      dex: best.dex,
      path: best.path,
      percentage: 100,
      amountIn: amountIn.toString(),
      amountOut: formattedOut,
      rawAmountOut: best.amountOut.toString(),
      fee: best.fee || 3000,
    };

    return res.status(200).json({
      routes: [route],
      totalAmountOut: best.amountOut.toString(),
      totalMinOut: minAmountOut.toString(),
      bestDex: best.dex,
      priceImpact: '0.1',
      formattedAmountOut: formattedOut,
    });
  } catch (error: any) {
    console.error('Pathfinder error:', error);
    return res.status(500).json({ error: error.message });
  }
}
