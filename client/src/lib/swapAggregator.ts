import { parseAbi, encodeFunctionData, encodeAbiParameters, parseAbiParameters, type Address } from 'viem';

export const SWAP_AGGREGATOR_ADDRESS = '0x6524822e437dcd23d62c77496d7a0ac980fbc81d' as Address;
export const NADFUN_SWAP_PROXY_ADDRESS = '0xa461a55b0e0c8cc2bb1039e93fbf1c298e571180' as Address;
export const WMON_ADDRESS = '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A' as Address;
export const NATIVE_MON = '0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE' as Address;
export const UNISWAP_V3_ROUTER = '0xfE31F71C1b106EAc32F1A19239c9a9A72ddfb900' as Address;
export const FEE_RECIPIENT = '0xE9059B5f1C60ecf9C1F07ac2bBa148A75394f56e' as Address;

export const NADFUN_BONDING_ROUTER = '0x6F6B8F1a20703309951a5127c45B49b1CD981A22' as Address;
export const NADFUN_DEX_ROUTER = '0x0B79d71AE99528D1dB24A4148b5f4F865cc2b137' as Address;
export const NADFUN_LENS = '0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea' as Address;

export const FEE_BPS = 30n; // 0.3%
export const BPS_DENOMINATOR = 10000n;

export const SWAP_AGGREGATOR_ABI = parseAbi([
  'function swapMONForTokens(address tokenOut, uint256 minOut, uint256 deadline, bool useV3, uint24 v3Fee) external payable returns (uint256)',
  'function swapTokensForMON(address tokenIn, uint256 amountIn, uint256 minOut, uint256 deadline, bool useV3, uint24 v3Fee) external returns (uint256)',
  'function swapTokensForTokens(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, uint256 deadline) external payable returns (uint256)',
  'function nadFunBuy(address token, uint256 minOut, uint256 deadline) external payable returns (uint256)',
  'function nadFunSell(address token, uint256 amountIn, uint256 minOut, uint256 deadline) external returns (uint256)',
  'function multiPathSwapMONForTokens(address tokenOut, (uint8 dexId, uint256 amountIn, uint256 minOut, uint24 v3Fee, address token, bool isGraduated)[] routes, uint256 deadline) external payable returns (uint256)',
  'function multiPathSwapTokensForMON(address tokenIn, uint256 totalAmountIn, (uint8 dexId, uint256 amountIn, uint256 minOut, uint24 v3Fee, address token, bool isGraduated)[] routes, uint256 deadline) external returns (uint256)',
  'function feeBps() external view returns (uint256)',
  'function platformRecipient() external view returns (address)',
  'function stakingRecipient() external view returns (address)',
  'function getVersion() external pure returns (string)',
]);

export const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
]);

export const WMON_ABI = parseAbi([
  'function deposit() external payable',
  'function withdraw(uint256 amount) external',
  'function balanceOf(address account) external view returns (uint256)',
]);

export const NADFUN_SWAP_PROXY_ABI = parseAbi([
  'function buyToken(address token, uint256 minAmountOut, uint256 deadline) external payable returns (uint256 amountOut)',
  'function sellToken(address token, uint256 amountIn, uint256 minAmountOut, uint256 deadline) external returns (uint256 amountOut)',
  'function feeBps() external view returns (uint256)',
  'function feeRecipient() external view returns (address)',
]);

export const NADFUN_ROUTER_ABI = parseAbi([
  'function buy((uint256 amountOutMin, address token, address to, uint256 deadline)) external payable returns (uint256 amountOut)',
  'function sell((uint256 amountIn, uint256 amountOutMin, address token, address to, uint256 deadline)) external returns (uint256 amountOut)',
]);

export const NADFUN_LENS_ABI = parseAbi([
  'function getAmountOut(address _token, uint256 _amountIn, bool _isBuy) external view returns (address router, uint256 amountOut)',
  'function isGraduated(address _token) external view returns (bool)',
]);

export const UNISWAP_V3_ROUTER_ABI = parseAbi([
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
  'function multicall(uint256 deadline, bytes[] calldata data) external payable returns (bytes[] memory)',
  'function unwrapWETH9(uint256 amountMinimum, address recipient) external payable',
]);

export interface RouteInfo {
  dexId: number;
  dexName: string;
  amountIn: string;
  expectedOut: string;
  minOut: string;
  percentage: number;
  v3Fee?: number;
  isGraduated?: boolean;
}

export interface SwapParams {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  minAmountOut: bigint;
  deadline: bigint;
  fromTokenPriceUSD?: number;
  monPriceUSD?: number;
  fromTokenDecimals?: number;
  dex?: string;
  isV3?: boolean;
  v3Fee?: number;
  userAddress?: Address;
  routes?: RouteInfo[];
}

export function isNativeMON(address: string): boolean {
  return address.toLowerCase() === NATIVE_MON.toLowerCase();
}

export function isWMON(address: string): boolean {
  return address.toLowerCase() === WMON_ADDRESS.toLowerCase();
}

export function calculateFeeInMON(
  amountIn: bigint, 
  fromTokenPriceUSD: number, 
  monPriceUSD: number,
  fromTokenDecimals: number = 18
): bigint {
  if (monPriceUSD <= 0 || fromTokenPriceUSD <= 0) {
    throw new Error("Invalid price - cannot calculate fee");
  }
  
  const PRICE_PRECISION = 10n ** 18n;
  const FEE_BPS_VALUE = 31n; // 0.31% to ensure we always cover 0.3% after rounding
  const BPS_DENOM = 10000n;
  
  const fromPriceScaled = BigInt(Math.ceil(fromTokenPriceUSD * 1e18));
  const monPriceScaled = BigInt(Math.floor(monPriceUSD * 1e18));
  
  if (fromPriceScaled === 0n) {
    throw new Error("Token price too low to calculate fee");
  }
  if (monPriceScaled === 0n) {
    throw new Error("MON price too low to calculate fee");
  }
  
  const decimalsDiff = 18 - fromTokenDecimals;
  const normalizedAmount = decimalsDiff >= 0 
    ? amountIn * (10n ** BigInt(decimalsDiff))
    : amountIn / (10n ** BigInt(-decimalsDiff));
  
  const valueInUSD = (normalizedAmount * fromPriceScaled) / PRICE_PRECISION;
  const feeInUSD = (valueInUSD * FEE_BPS_VALUE + BPS_DENOM - 1n) / BPS_DENOM;
  const feeInMON = (feeInUSD * PRICE_PRECISION + monPriceScaled - 1n) / monPriceScaled;
  
  const MIN_FEE = 10n ** 14n; // Minimum 0.0001 MON
  return feeInMON > MIN_FEE ? feeInMON : MIN_FEE;
}

export interface NadFunSwapResult {
  data: `0x${string}`;
  value: bigint;
  targetContract: Address;
  feeAmount: bigint;
  feeRecipient: Address;
  routerType: 'bonding' | 'dex';
}

export function getNadFunDirectSwapData(
  params: SwapParams & { routerAddress?: Address; userAddress: Address }
): NadFunSwapResult {
  const { tokenIn, tokenOut, amountIn, minAmountOut, deadline, routerAddress, userAddress } = params;
  
  if (isWMON(tokenIn)) {
    throw new Error("WMON cannot be used for Nad.Fun buys. Please unwrap WMON to MON first, then retry the swap.");
  }
  
  const isBuy = isNativeMON(tokenIn);
  const isSell = isNativeMON(tokenOut) || isWMON(tokenOut);
  const targetToken = isBuy ? tokenOut : tokenIn;
  
  const router = routerAddress || NADFUN_DEX_ROUTER;
  const routerType: 'bonding' | 'dex' = router.toLowerCase() === NADFUN_BONDING_ROUTER.toLowerCase() ? 'bonding' : 'dex';
  
  const feeAmount = (amountIn * FEE_BPS + BPS_DENOMINATOR - 1n) / BPS_DENOMINATOR;
  const amountAfterFee = amountIn - feeAmount;
  
  if (isBuy) {
    const buyParams = {
      amountOutMin: minAmountOut,
      token: targetToken,
      to: userAddress,
      deadline: deadline,
    };
    
    const data = encodeFunctionData({
      abi: NADFUN_ROUTER_ABI,
      functionName: 'buy',
      args: [buyParams],
    });
    
    return {
      data,
      value: amountAfterFee,
      targetContract: router,
      feeAmount,
      feeRecipient: FEE_RECIPIENT,
      routerType,
    };
  } else if (isSell) {
    const sellParams = {
      amountIn: amountIn,
      amountOutMin: minAmountOut,
      token: tokenIn,
      to: userAddress,
      deadline: deadline,
    };
    
    const data = encodeFunctionData({
      abi: NADFUN_ROUTER_ABI,
      functionName: 'sell',
      args: [sellParams],
    });
    
    return {
      data,
      value: 0n,
      targetContract: router,
      feeAmount: 0n,
      feeRecipient: FEE_RECIPIENT,
      routerType,
    };
  } else {
    throw new Error("Nad.Fun only supports MON↔token swaps. For token↔token, use a different DEX.");
  }
}

export function getNadFunSwapData(params: SwapParams): { data: `0x${string}`; value: bigint; targetContract: Address } {
  const { tokenIn, tokenOut, amountIn, minAmountOut, deadline } = params;
  
  if (isWMON(tokenIn)) {
    throw new Error("WMON cannot be used for Nad.Fun buys. Please unwrap WMON to MON first, then retry the swap.");
  }
  
  const isBuy = isNativeMON(tokenIn);
  const isSell = isNativeMON(tokenOut) || isWMON(tokenOut);
  const targetToken = isBuy ? tokenOut : tokenIn;
  
  if (isBuy) {
    return {
      data: encodeFunctionData({
        abi: NADFUN_SWAP_PROXY_ABI,
        functionName: 'buyToken',
        args: [targetToken, minAmountOut, deadline],
      }),
      value: amountIn,
      targetContract: NADFUN_SWAP_PROXY_ADDRESS,
    };
  } else if (isSell) {
    return {
      data: encodeFunctionData({
        abi: NADFUN_SWAP_PROXY_ABI,
        functionName: 'sellToken',
        args: [tokenIn, amountIn, minAmountOut, deadline],
      }),
      value: 0n,
      targetContract: NADFUN_SWAP_PROXY_ADDRESS,
    };
  } else {
    throw new Error("Nad.Fun only supports MON↔token swaps. For token↔token, use a different DEX.");
  }
}

export function getSwapFunctionData(params: SwapParams): { data: `0x${string}`; value: bigint; targetContract: Address } {
  const { 
    tokenIn, 
    tokenOut, 
    amountIn, 
    minAmountOut, 
    deadline, 
    fromTokenPriceUSD = 0, 
    monPriceUSD = 0,
    fromTokenDecimals = 18,
    dex = '',
    isV3 = false,
    v3Fee = 3000,
    userAddress,
    routes = []
  } = params;
  
  // Handle wrap/unwrap FIRST (before nadfun check)
  if (isNativeMON(tokenIn) && isWMON(tokenOut)) {
    return {
      data: encodeFunctionData({
        abi: WMON_ABI,
        functionName: 'deposit',
      }),
      value: amountIn,
      targetContract: WMON_ADDRESS,
    };
  }
  
  if (isWMON(tokenIn) && isNativeMON(tokenOut)) {
    return {
      data: encodeFunctionData({
        abi: WMON_ABI,
        functionName: 'withdraw',
        args: [amountIn],
      }),
      value: 0n,
      targetContract: WMON_ADDRESS,
    };
  }
  
  if (dex === 'nadfun' || (routes.length === 1 && routes[0]?.dexId === 3)) {
    const isBuy = isNativeMON(tokenIn);
    const isSell = isNativeMON(tokenOut) || isWMON(tokenOut);
    const targetToken = isBuy ? tokenOut : tokenIn;
    
    if (isBuy) {
      return {
        data: encodeFunctionData({
          abi: SWAP_AGGREGATOR_ABI,
          functionName: 'nadFunBuy',
          args: [targetToken, minAmountOut, deadline],
        }),
        value: amountIn,
        targetContract: SWAP_AGGREGATOR_ADDRESS,
      };
    } else if (isSell) {
      return {
        data: encodeFunctionData({
          abi: SWAP_AGGREGATOR_ABI,
          functionName: 'nadFunSell',
          args: [targetToken, amountIn, minAmountOut, deadline],
        }),
        value: 0n,
        targetContract: SWAP_AGGREGATOR_ADDRESS,
      };
    } else {
      throw new Error("Nad.Fun only supports MON↔token swaps. For token↔token, use a different DEX.");
    }
  }
  
  if (isNativeMON(tokenIn)) {
    if (isWMON(tokenOut)) {
      return {
        data: encodeFunctionData({
          abi: WMON_ABI,
          functionName: 'deposit',
        }),
        value: amountIn,
        targetContract: WMON_ADDRESS,
      };
    }
    
    console.log('[ABI] swapMONForTokens args:', {
      tokenOut,
      minAmountOut: minAmountOut.toString(),
      deadline: deadline.toString(),
      isV3,
      v3Fee,
    });
    
    const safeV3FeeForMON = Number(v3Fee) || 3000;
    
    return {
      data: encodeFunctionData({
        abi: SWAP_AGGREGATOR_ABI,
        functionName: 'swapMONForTokens',
        args: [tokenOut, minAmountOut, deadline, isV3, safeV3FeeForMON],
      }),
      value: amountIn,
      targetContract: SWAP_AGGREGATOR_ADDRESS,
    };
  }
  
  if (isNativeMON(tokenOut) || isWMON(tokenOut)) {
    if (isWMON(tokenIn) && isNativeMON(tokenOut)) {
      return {
        data: encodeFunctionData({
          abi: WMON_ABI,
          functionName: 'withdraw',
          args: [amountIn],
        }),
        value: 0n,
        targetContract: WMON_ADDRESS,
      };
    }
    
    if (isNativeMON(tokenIn) && isWMON(tokenOut)) {
      return {
        data: encodeFunctionData({
          abi: WMON_ABI,
          functionName: 'deposit',
        }),
        value: amountIn,
        targetContract: WMON_ADDRESS,
      };
    }
    
    console.log('[ABI] swapTokensForMON args:', {
      tokenIn,
      amountIn: amountIn.toString(),
      amountInHex: amountIn.toString(16),
      minAmountOut: minAmountOut.toString(),
      minAmountOutHex: minAmountOut.toString(16),
      deadline: deadline.toString(),
      isV3,
      v3Fee,
    });
    
    // Validate minAmountOut is a proper BigInt
    if (typeof minAmountOut !== 'bigint') {
      console.error('[ABI] ERROR: minAmountOut is not a BigInt!', typeof minAmountOut);
    }
    
    const safeV3Fee = Number(v3Fee) || 3000;
    
    return {
      data: encodeFunctionData({
        abi: SWAP_AGGREGATOR_ABI,
        functionName: 'swapTokensForMON',
        args: [tokenIn, amountIn, minAmountOut, deadline, isV3, safeV3Fee],
      }),
      value: 0n,
      targetContract: SWAP_AGGREGATOR_ADDRESS,
    };
  }
  
  const feeInMON = calculateFeeInMON(amountIn, fromTokenPriceUSD, monPriceUSD, fromTokenDecimals);
  
  return {
    data: encodeFunctionData({
      abi: SWAP_AGGREGATOR_ABI,
      functionName: 'swapTokensForTokens',
      args: [tokenIn, tokenOut, amountIn, minAmountOut, deadline],
    }),
    value: feeInMON,
    targetContract: SWAP_AGGREGATOR_ADDRESS,
  };
}

export function getApprovalData(spender: Address, amount: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [spender, amount],
  });
}

export function calculateMinAmountOut(amountOut: string, slippagePercent: number): bigint {
  const amount = BigInt(Math.floor(parseFloat(amountOut) * 1e18));
  const slippageBps = BigInt(Math.floor(slippagePercent * 100));
  const minAmount = amount - (amount * slippageBps / 10000n);
  return minAmount;
}

export function getDeadline(minutesFromNow: number = 20): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + minutesFromNow * 60);
}

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

export function getMultiPathSwapData(
  tokenAddress: Address,
  routes: SwapRoute[],
  deadline: bigint,
  isBuy: boolean = true
): { data: `0x${string}`; value: bigint; targetContract: Address } {
  const routeArgs = routes.map(r => ({
    dexId: r.dexId,
    amountIn: BigInt(r.amountIn),
    minOut: BigInt(r.minOut),
    v3Fee: r.v3Fee,
    token: tokenAddress as Address,
    isGraduated: r.isGraduated,
  }));

  const totalValue = routes.reduce((sum, r) => sum + BigInt(r.amountIn), 0n);

  if (isBuy) {
    return {
      data: encodeFunctionData({
        abi: SWAP_AGGREGATOR_ABI,
        functionName: 'multiPathSwapMONForTokens',
        args: [tokenAddress, routeArgs, deadline],
      }),
      value: totalValue,
      targetContract: SWAP_AGGREGATOR_ADDRESS,
    };
  } else {
    return {
      data: encodeFunctionData({
        abi: SWAP_AGGREGATOR_ABI,
        functionName: 'multiPathSwapTokensForMON',
        args: [tokenAddress, totalValue, routeArgs, deadline],
      }),
      value: 0n,
      targetContract: SWAP_AGGREGATOR_ADDRESS,
    };
  }
}
