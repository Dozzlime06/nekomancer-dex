import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createPublicClient, http, parseAbi, parseUnits, formatUnits } from 'viem';

const RPC_URL = 'https://rpc3.monad.xyz/';
const WMON = '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A';

const UNISWAP_V2_ROUTER = '0x4B2ab38DBF28D31D467aA8993f6c2585981D6804';
const UNISWAP_V3_QUOTER = '0x661E93cca42AfacB172121EF892830cA3b70F08d';

const V2_ROUTER_ABI = parseAbi([
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
]);

const V3_QUOTER_ABI = parseAbi([
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { tokenIn, tokenOut, amountIn, decimalsIn, decimalsOut } = req.query;
    
    if (!tokenIn || !tokenOut || !amountIn) {
      return res.status(400).json({ error: 'Missing parameters' });
    }

    const client = createPublicClient({ transport: http(RPC_URL) });
    const inputAmount = parseUnits(amountIn as string, Number(decimalsIn) || 18);
    
    const fromAddr = (tokenIn as string).toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' 
      ? WMON : tokenIn as string;
    const toAddr = (tokenOut as string).toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
      ? WMON : tokenOut as string;

    let bestAmount = 0n;
    let bestDex = 'uniswap_v2';
    let bestFee = 3000;

    // Try V2
    try {
      const path = [fromAddr, toAddr];
      const amounts = await client.readContract({
        address: UNISWAP_V2_ROUTER as `0x${string}`,
        abi: V2_ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: [inputAmount, path as `0x${string}`[]],
      }) as bigint[];
      if (amounts[1] > bestAmount) {
        bestAmount = amounts[1];
        bestDex = 'uniswap_v2';
      }
    } catch {}

    // Try V3 with different fees
    for (const fee of [500, 3000, 10000]) {
      try {
        const result = await client.simulateContract({
          address: UNISWAP_V3_QUOTER as `0x${string}`,
          abi: V3_QUOTER_ABI,
          functionName: 'quoteExactInputSingle',
          args: [{
            tokenIn: fromAddr as `0x${string}`,
            tokenOut: toAddr as `0x${string}`,
            amountIn: inputAmount,
            fee,
            sqrtPriceLimitX96: 0n,
          }],
        });
        const amountOut = (result.result as any)[0] as bigint;
        if (amountOut > bestAmount) {
          bestAmount = amountOut;
          bestDex = 'uniswap_v3';
          bestFee = fee;
        }
      } catch {}
    }

    const formattedAmount = formatUnits(bestAmount, Number(decimalsOut) || 18);

    return res.status(200).json({
      amountOut: formattedAmount,
      bestDex,
      bestFee,
      rawAmountOut: bestAmount.toString(),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
