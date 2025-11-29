import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createPublicClient, http, parseAbi, formatUnits } from 'viem';

const RPC_URL = 'https://rpc3.monad.xyz/';
const NATIVE_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

const ERC20_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { tokenAddress, userAddress } = req.body || req.query;
    
    if (!tokenAddress || !userAddress) {
      return res.status(400).json({ error: 'Missing tokenAddress or userAddress' });
    }

    const client = createPublicClient({ transport: http(RPC_URL) });
    
    let balance: bigint;
    let decimals = 18;
    
    if (tokenAddress.toLowerCase() === NATIVE_TOKEN.toLowerCase()) {
      balance = await client.getBalance({ address: userAddress as `0x${string}` });
    } else {
      const [rawBalance, tokenDecimals] = await Promise.all([
        client.readContract({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [userAddress as `0x${string}`],
        }),
        client.readContract({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'decimals',
        }).catch(() => 18),
      ]);
      balance = rawBalance as bigint;
      decimals = Number(tokenDecimals);
    }
    
    const formatted = formatUnits(balance, decimals);

    return res.status(200).json({
      balance: formatted,
      rawBalance: balance.toString(),
      decimals,
    });
  } catch (error: any) {
    console.error('Balance error:', error);
    return res.status(500).json({ error: error.message, balance: '0' });
  }
}
