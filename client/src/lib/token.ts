// Token data cache to avoid repeated API calls
const tokenCache = new Map<string, any>();

interface TokenData {
  name: string;
  symbol: string;
  logo?: string;
  decimals?: number;
}

// Chain configurations
const CHAIN_CONFIG: Record<number, { name: string; apis: string[] }> = {
  // Monad
  143: {
    name: 'Monad',
    apis: ['https://token.1inch.io/v2/143'],
  },
  // Monad Testnet
  41454: {
    name: 'Monad Testnet',
    apis: ['https://testnet-api.monad.xyz/api/v1/tokens'],
  },
  // Monad Mainnet
  41455: {
    name: 'Monad Mainnet',
    apis: ['https://token.1inch.io/v2/41455'],
  },
  // Ethereum Mainnet (1inch support)
  1: {
    name: 'Ethereum',
    apis: ['https://token.1inch.io/v2/1'],
  },
  // Polygon
  137: {
    name: 'Polygon',
    apis: ['https://token.1inch.io/v2/137'],
  },
};

export async function getTokenData(tokenAddress: string, chainId: number = 41455): Promise<TokenData> {
  const cacheKey = `${chainId}:${tokenAddress.toLowerCase()}`;
  
  // Return cached data if available
  if (tokenCache.has(cacheKey)) {
    return tokenCache.get(cacheKey);
  }

  const config = CHAIN_CONFIG[chainId];
  const apis = config?.apis || ['https://token.1inch.io/v2/1'];

  // Try each API in order
  for (const baseUrl of apis) {
    try {
      let response;
      
      if (baseUrl.includes('1inch')) {
        // 1inch API format
        response = await fetch(`${baseUrl}/search?query=${tokenAddress}`);
        if (response.ok) {
          const data = await response.json();
          if (data && data.length > 0) {
            const token = data[0];
            const tokenData: TokenData = {
              name: token.name || 'Unknown Token',
              symbol: token.symbol || 'TKN',
              logo: token.logoURI,
              decimals: token.decimals,
            };
            tokenCache.set(cacheKey, tokenData);
            return tokenData;
          }
        }
      } else {
        // Monad API format
        response = await fetch(`${baseUrl}/${tokenAddress}`);
        if (response.ok) {
          const data = await response.json();
          const tokenData: TokenData = {
            name: data.name || 'Unknown Token',
            symbol: data.symbol || 'TKN',
            logo: data.logoURI || data.logoUrl,
            decimals: data.decimals,
          };
          tokenCache.set(cacheKey, tokenData);
          return tokenData;
        }
      }
    } catch (error) {
      console.debug(`Error fetching from ${baseUrl}:`, error);
    }
  }

  // Default fallback
  const defaultData: TokenData = {
    name: 'Unknown Token',
    symbol: 'TKN',
    decimals: 18,
  };
  tokenCache.set(cacheKey, defaultData);
  return defaultData;
}

export function clearTokenCache() {
  tokenCache.clear();
}

// Get current chain ID (can be configured)
export function getCurrentChainId(): number {
  const chainId = import.meta.env.VITE_CHAIN_ID;
  return chainId ? parseInt(chainId) : 143; // Default to Monad
}

// Fetch wallet token holdings
export async function getWalletTokens(userAddress: string, chainId: number, tokens: Array<{ name: string; symbol: string; address: string }>) {
  try {
    const walletTokens = [];
    
    for (const token of tokens) {
      try {
        const response = await fetch('/api/balance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tokenAddress: token.address,
            userAddress: userAddress,
            chainId: chainId,
          }),
        });
        
        if (response.ok) {
          const data = await response.json();
          const balance = data.balance || '0';
          walletTokens.push({ ...token, balance: balance });
        } else {
          walletTokens.push({ ...token, balance: '0' });
        }
      } catch (error) {
        console.debug(`Error fetching balance for ${token.symbol}:`, error);
        walletTokens.push({ ...token, balance: '0' });
      }
    }
    
    return walletTokens;
  } catch (error) {
    console.error('Error fetching wallet tokens:', error);
    return [];
  }
}
