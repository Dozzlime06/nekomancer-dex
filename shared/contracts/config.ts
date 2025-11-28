// Contract configuration for Monad Mainnet (Chain 143)
export const CONTRACT_CONFIG = {
  // Deployed TokenLocker contract address (SafeERC20 version - ensures proper token transfers)
  LOCKER_ADDRESS: (import.meta.env.VITE_LOCKER_CONTRACT_ADDRESS as string) || '0xc3b78fcf11623ab5705210d470bf2940714e9a40',
  
  // Token Registry contract address - stores official token metadata on-chain
  TOKEN_REGISTRY_ADDRESS: (import.meta.env.VITE_TOKEN_REGISTRY_ADDRESS as string) || '0x4fd9b09eecec2aa6d69cd4411abcf1aa3bf2c70d',
  
  // SwapAggregatorV3 contract address - deployed on Monad mainnet (Nov 27, 2025)
  // Supports: Uniswap V2, V3, PancakeSwap V2 with slippage protection and enforced fee collection
  SWAP_AGGREGATOR_ADDRESS: (import.meta.env.VITE_SWAP_AGGREGATOR_ADDRESS as string) || '0x930b96f20e3f967587ee97103f970b0ced3f6005',
  
  // NadFunSwapProxy contract address - deployed on Monad mainnet (Nov 27, 2025)
  // Handles Nad.Fun bonding curve and DEX swaps with 0.3% fee enforcement
  NADFUN_SWAP_PROXY_ADDRESS: (import.meta.env.VITE_NADFUN_PROXY_ADDRESS as string) || '0xf949081f414876193708f414999e35aee2bdc9ed',
  
  // Monad Mainnet config
  CHAIN_ID: 143,
  CHAIN_NAME: 'Monad',
  RPC_URL: 'https://rpc3.monad.xyz/',
  
  // Wrapped MON token (chain-native)
  WMON_ADDRESS: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A',
};

// DEX Routers on Monad Mainnet - Official Addresses (Nov 2025)
export const DEX_ROUTERS = {
  // Uniswap V3 - Official Deployment
  UNISWAP_V3: {
    FACTORY: '0x204faca1764b154221e35c0d20abb3c525710498',
    SWAP_ROUTER: '0xfe31f71c1b106eac32f1a19239c9a9a72ddfb900', // SwapRouter02
    QUOTER_V2: '0x661e93cca42afacb172121ef892830ca3b70f08d',
    UNIVERSAL_ROUTER: '0x0d97dc33264bfc1c226207428a79b26757fb9dc3',
    POSITION_MANAGER: '0x7197e214c0b767cfb76fb734ab638e2c192f4e53',
    MULTICALL: '0xd1b797d92d87b688193a2b976efc8d577d204343',
    PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
  },
  
  // Uniswap V2 - Official Deployment
  UNISWAP_V2: {
    FACTORY: '0x182a927119d56008d921126764bf884221b10f59',
    ROUTER: '0x4b2ab38dbf28d31d467aa8993f6c2585981d6804',
  },
  
  // PancakeSwap V2 - Official Deployment
  PANCAKESWAP_V2: {
    FACTORY: '0x02a84c1b3BBD7401a5f7fa98a384EBC70bB5749E',
    ROUTER: '0xB1Bc24c34e88f7D43D5923034E3a14B24DaACfF9',
  },
  
  // Nad.Fun - Official Deployment (Bonding Curve + DEX)
  NADFUN: {
    LENS: '0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea',
    BONDING_CURVE: '0xA7283d07812a02AFB7C09B60f8896bCEA3F90aCE',
    BONDING_CURVE_ROUTER: '0x6F6B8F1a20703309951a5127c45B49b1CD981A22',
    DEX_ROUTER: '0x0B79d71AE99528D1dB24A4148b5f4F865cc2b137',
    DEX_FACTORY: '0x6B5F564339DbAD6b780249827f2198a841FEB7F3',
    WMON: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A',
  },
};

// Slippage presets (in basis points: 100 = 1%)
export const SLIPPAGE_PRESETS = {
  LOW: 10,      // 0.1%
  MEDIUM: 50,   // 0.5%
  HIGH: 100,    // 1%
  VERY_HIGH: 300, // 3%
};

// Default slippage tolerance
export const DEFAULT_SLIPPAGE = SLIPPAGE_PRESETS.MEDIUM; // 0.5%

// Fee configuration
export const FEE_CONFIG = {
  PROTOCOL_FEE_BPS: 30, // 0.3% protocol fee
  FEE_RECIPIENT: '0xE9059B5f1C60ecf9C1F07ac2bBa148A75394f56e', // Protocol fee treasury
};

export const MONAD_CHAIN = {
  id: 143,
  name: 'Monad',
  network: 'monad',
  nativeCurrency: {
    decimals: 18,
    name: 'MON',
    symbol: 'MON',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc3.monad.xyz/'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Monad Vision',
      url: 'https://monadvision.com/',
    },
  },
};
