// Popular ERC20 tokens across supported chains
export const POPULAR_TOKENS: Record<number, Array<{ name: string; symbol: string; address: string; logo?: string }>> = {
  143: [ // Monad
    { name: 'MON', symbol: 'MON', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },
    { name: 'Wrapped MON', symbol: 'WMON', address: '0xba5B3b1391b193e76A1F57e70f47ffb0ed1f4b93' },
    { name: 'USD Coin', symbol: 'USDC', address: '0x2f6f07cdcf3588944bf4c42ac74ff24bf56fde4d' },
    { name: 'Tether', symbol: 'USDT', address: '0x1e4a5963cbac519c6426233343d7e5014ea477b1' },
  ],
  41454: [ // Monad Testnet
    { name: 'MON', symbol: 'MON', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },
    { name: 'Wrapped MON', symbol: 'WMON', address: '0xba5B3b1391b193e76A1F57e70f47ffb0ed1f4b93' },
    { name: 'Test USDC', symbol: 'USDC', address: '0x2f6f07cdcf3588944bf4c42ac74ff24bf56fde4d' },
    { name: 'Test USDT', symbol: 'USDT', address: '0x1e4a5963cbac519c6426233343d7e5014ea477b1' },
  ],
  41455: [ // Monad Mainnet
    { name: 'MON', symbol: 'MON', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },
    { name: 'Wrapped MON', symbol: 'WMON', address: '0xba5B3b1391b193e76A1F57e70f47ffb0ed1f4b93' },
    { name: 'USD Coin', symbol: 'USDC', address: '0x2f6f07cdcf3588944bf4c42ac74ff24bf56fde4d' },
    { name: 'Tether', symbol: 'USDT', address: '0x1e4a5963cbac519c6426233343d7e5014ea477b1' },
  ],
  1: [ // Ethereum
    { name: 'Wrapped Ether', symbol: 'WETH', address: '0xC02aaA39b223FE8D0A0e8e4F27ead9083C756Cc2' },
    { name: 'USD Coin', symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
    { name: 'Tether', symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
    { name: 'Uniswap', symbol: 'UNI', address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984' },
  ],
  137: [ // Polygon
    { name: 'Wrapped MATIC', symbol: 'WMATIC', address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270' },
    { name: 'USD Coin', symbol: 'USDC', address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' },
    { name: 'Tether', symbol: 'USDT', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' },
  ],
};

export function getTokensForChain(chainId: number) {
  return POPULAR_TOKENS[chainId] || POPULAR_TOKENS[143]; // Default to Monad
}
