import { encodeFunctionData, parseUnits } from 'viem';

export interface CreateLockParams {
  tokenAddress: string;
  amount: string;
  unlockTime: number;
  ownerAddress: string;
}

/**
 * Get the direct injected wallet provider (bypass Privy)
 * Priority: OKX > MetaMask > any window.ethereum
 */
export function getDirectProvider(): any {
  // @ts-ignore - OKX wallet injects okxwallet
  if (typeof window !== 'undefined' && (window as any).okxwallet) {
    console.log('[WALLET] Using OKX direct provider');
    return (window as any).okxwallet;
  }
  // @ts-ignore - Standard ethereum provider
  if (typeof window !== 'undefined' && (window as any).ethereum) {
    console.log('[WALLET] Using window.ethereum provider');
    return (window as any).ethereum;
  }
  return null;
}

/**
 * Try direct provider first, fallback to Privy provider
 */
export async function getBestProvider(privyProvider: any): Promise<any> {
  const directProvider = getDirectProvider();
  if (directProvider) {
    try {
      // Check if wallet is unlocked and on correct chain
      const accounts = await directProvider.request({ method: 'eth_accounts' });
      if (accounts && accounts.length > 0) {
        console.log('[WALLET] Direct provider connected:', accounts[0]);
        return directProvider;
      }
    } catch (e) {
      console.log('[WALLET] Direct provider not ready, using Privy');
    }
  }
  return privyProvider;
}

// Proper ABIs with stateMutability
export const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ type: 'bool' }]
  }
] as const;

export const LOCKER_ABI = [
  {
    type: 'function',
    name: 'createLock',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_token', type: 'address' },
      { name: '_amount', type: 'uint256' },
      { name: '_unlockTime', type: 'uint256' }
    ],
    outputs: []
  }
] as const;

export const LOCKER_ADDRESS = '0x0ee5afbce679b38b984a354cd659c987e0f637f0' as const;

/**
 * Encode approve transaction data
 */
export function encodeApproveData(spender: string, amount: string | bigint): string {
  const approveAmount = typeof amount === 'bigint' ? amount : parseUnits(amount, 18);
  return encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [spender as `0x${string}`, approveAmount]
  });
}

/**
 * Encode lock transaction data
 */
export function encodeLockData(token: string, amount: string, unlockTime: number): string {
  const lockAmount = parseUnits(amount, 18);
  return encodeFunctionData({
    abi: LOCKER_ABI,
    functionName: 'createLock',
    args: [token as `0x${string}`, lockAmount, BigInt(unlockTime)]
  });
}

export function dateToUnixTimestamp(date: string): number {
  return Math.floor(new Date(date).getTime() / 1000);
}

export function getWalletAddress(wallet: any): string | null {
  return wallet?.address || null;
}

export function isWalletConnected(wallet: any): boolean {
  return !!wallet?.address;
}

/**
 * Ensure wallet is on Monad chain
 */
export async function ensureMonadChain(provider: any): Promise<void> {
  try {
    const currentChainId = await provider.request({ method: 'eth_chainId' });
    if (currentChainId !== '0x8f') { // 143 in hex
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x8f' }],
        });
      } catch (switchError: any) {
        if (switchError.code === 4902) {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0x8f',
              chainName: 'Monad',
              rpcUrls: ['https://rpc3.monad.xyz/'],
              nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
              blockExplorerUrls: ['https://monadvision.com/'],
            }],
          });
        }
      }
    }
  } catch (chainError) {
    console.warn('Chain detection failed, continuing anyway:', chainError);
  }
}

/**
 * Send transaction via provider with automatic chain detection
 * Let wallet estimate gas for better compatibility
 */
export async function sendTransactionViaProvider(provider: any, from: string, to: string, data: string): Promise<string> {
  if (!provider) {
    throw new Error('No provider available');
  }

  await ensureMonadChain(provider);

  // Let wallet estimate gas - don't override
  // This provides better compatibility with OKX and other wallets
  const txHash = await provider.request({
    method: 'eth_sendTransaction',
    params: [{
      from: from as `0x${string}`,
      to: to as `0x${string}`,
      data: data as `0x${string}`,
      chainId: '0x8f', // 143 in hex
    }]
  });

  return txHash;
}

/**
 * Send transaction with value (for native MON transfers)
 * Let wallet estimate gas for better compatibility
 */
export async function sendTransactionWithValue(
  provider: any, 
  from: string, 
  to: string, 
  data: string,
  value: string
): Promise<string> {
  if (!provider) {
    throw new Error('No provider available');
  }

  await ensureMonadChain(provider);

  // Let wallet estimate gas - don't override
  // This provides better compatibility with external wallets like OKX
  const txHash = await provider.request({
    method: 'eth_sendTransaction',
    params: [{
      from: from as `0x${string}`,
      to: to as `0x${string}`,
      data: data as `0x${string}`,
      value: value as `0x${string}`,
      chainId: '0x8f', // 143 in hex - explicitly set chain
    }]
  });

  return txHash;
}

/**
 * Check token allowance
 */
export async function checkAllowance(
  provider: any,
  tokenAddress: string,
  owner: string,
  spender: string
): Promise<bigint> {
  const data = encodeFunctionData({
    abi: [{
      type: 'function',
      name: 'allowance',
      stateMutability: 'view',
      inputs: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' }
      ],
      outputs: [{ type: 'uint256' }]
    }] as const,
    functionName: 'allowance',
    args: [owner as `0x${string}`, spender as `0x${string}`]
  });

  const result = await provider.request({
    method: 'eth_call',
    params: [{
      to: tokenAddress,
      data: data,
    }, 'latest']
  });

  return BigInt(result);
}
