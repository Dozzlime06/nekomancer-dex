import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createPublicClient, http, parseAbi, formatUnits } from 'viem';

const RPC_URL = 'https://rpc3.monad.xyz/';
const WMON = '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A';
const USDC = '0x754704Bc059F8C67012fEd69BC8A327a5aafb603';

const V3_QUOTER = '0x661E93cca42AfacB172121EF892830cA3b70F08d';
const V3_QUOTER_ABI = parseAbi([
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
]);

const KNOWN_TOKENS = [
  { address: '0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE', symbol: 'MON', name: 'Monad', decimals: 18, logo: 'https://dd.dexscreener.com/ds-data/tokens/monad/0x3bd359c1119da7da1d913d1c4d2b7c461115433a.png' },
  { address: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', symbol: 'WMON', name: 'Wrapped MON', decimals: 18, logo: 'https://dd.dexscreener.com/ds-data/tokens/monad/0x3bd359c1119da7da1d913d1c4d2b7c461115433a.png' },
  { address: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', symbol: 'USDC', name: 'USDC', decimals: 6, logo: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png' },
  { address: '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18, logo: 'https://assets.coingecko.com/coins/images/2518/small/weth.png' },
  { address: '0x350035555E10d9AfAF1566AaebfCeD5BA6C27777', symbol: 'CHOG', name: 'Chog', decimals: 18, logo: 'https://dd.dexscreener.com/ds-data/tokens/monad/0x350035555e10d9afaf1566aaebfced5ba6c27777.png' },
  { address: '0x788571E0E5067Adea87e6BA22a2b738fFDf48888', symbol: 'UNIT', name: 'UNIT', decimals: 18, logo: 'https://dd.dexscreener.com/ds-data/tokens/monad/0x788571e0e5067adea87e6ba22a2b738ffdf48888.png' },
  { address: '0x99aE2DC76c43979E3BcC0ae8d69F1fca077c8888', symbol: 'ANAGO', name: 'Anago', decimals: 18, logo: 'https://dd.dexscreener.com/ds-data/tokens/monad/0x99ae2dc76c43979e3bcc0ae8d69f1fca077c8888.png' },
  { address: '0x1f80C65cC2c37Af84ABbe1ea03183A624a6F8888', symbol: 'GMONAD', name: 'Gmonad', decimals: 18, logo: 'https://dd.dexscreener.com/ds-data/tokens/monad/0x1f80c65cc2c37af84abbe1ea03183a624a6f8888.png' },
  { address: '0x4bEdf5d792DAb4BfeF048d86af4404228DF3F3fb', symbol: 'BOTS', name: 'Mobots', decimals: 18, logo: 'https://dd.dexscreener.com/ds-data/tokens/monad/0x4bedf5d792dab4bfef048d86af4404228df3f3fb.png' },
  { address: '0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c', symbol: 'SHMON', name: 'ShMonad', decimals: 18, logo: 'https://www.fastlane.xyz/branding-page/shmonad/png/SHMONAD_ICON.png' },
  { address: '0x441a941B925FBFD5e33b5a820FFcC21D196faA76', symbol: 'MONK', name: 'Monk The Monkey King', decimals: 18, logo: 'https://dd.dexscreener.com/ds-data/tokens/monad/0x441a941b925fbfd5e33b5a820ffcc21d196faa76.png' },
  { address: '0x1361d007E8f6aBDd7a873f413513A381AeFed404', symbol: 'DUKO', name: 'MONAD DUKO', decimals: 18, logo: 'https://dd.dexscreener.com/ds-data/tokens/monad/0x1361d007e8f6abdd7a873f413513a381aefed404.png' },
  { address: '0x87deEb3696Ec069d5460C389cc78925df50d7777', symbol: 'IDGAF', name: 'IDGAF', decimals: 18, logo: 'https://cdn.dexscreener.com/cms/images/cf30e4dde22a51edafcd6d4f5098433d5f00f9d963bd554d2bdcfe77cf35637b' },
  { address: '0xA7b3F394B9AAbA67f2543a8c1A0F753cC68d7777', symbol: 'GONAD', name: 'GONAD', decimals: 18, logo: 'https://cdn.dexscreener.com/cms/images/fc4f1b58caeb78943d8abd932f3a155ee6c938fbff008af0e46931900560e924' },
  { address: '0xc911Ba7aEE487f5145702c20c20a40d9e5B87777', symbol: 'HOGDOG', name: 'Hog Dog', decimals: 18, logo: 'https://cdn.dexscreener.com/cms/images/3e4932ef50030f4c9097fcbf7fbb649e06457b81b52c2b29a51b9baa608d8617' },
];

async function getTokenPrice(client: any, tokenAddress: string, decimals: number): Promise<number> {
  const addr = tokenAddress.toLowerCase();
  
  if (addr === '0x754704bc059f8c67012fed69bc8a327a5aafb603') return 1;
  
  const isNative = addr === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
  const isWmon = addr === WMON.toLowerCase();
  const tokenIn = isNative || isWmon ? WMON : tokenAddress;
  
  try {
    const amountIn = BigInt(10 ** decimals);
    const result = await client.simulateContract({
      address: V3_QUOTER as `0x${string}`,
      abi: V3_QUOTER_ABI,
      functionName: 'quoteExactInputSingle',
      args: [{
        tokenIn: tokenIn as `0x${string}`,
        tokenOut: USDC as `0x${string}`,
        amountIn,
        fee: 3000,
        sqrtPriceLimitX96: 0n,
      }],
    });
    const amountOut = (result.result as any)[0] as bigint;
    return Number(formatUnits(amountOut, 6));
  } catch {
    return 0;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const client = createPublicClient({ transport: http(RPC_URL) });
    
    const tokensWithPrices = await Promise.all(
      KNOWN_TOKENS.map(async (token) => {
        const price = await getTokenPrice(client, token.address, token.decimals);
        return { ...token, price };
      })
    );
    
    return res.status(200).json(tokensWithPrices);
  } catch (error: any) {
    return res.status(200).json(KNOWN_TOKENS.map(t => ({ ...t, price: 0 })));
  }
}
