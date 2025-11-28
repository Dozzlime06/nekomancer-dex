import { CONTRACT_CONFIG } from '@shared/contracts/config';
import { 
  createPublicClient, 
  http, 
  parseAbi,
  getAddress,
  formatUnits,
  parseUnits,
  encodeFunctionData,
  toHex
} from 'viem';

// TokenLocker ABI
const TOKENLOCKER_ABI = parseAbi([
  'function createLock(address _token, uint256 _amount, uint256 _unlockTime) external',
  'function withdrawLock(uint256 _lockId) external',
  'function emergencyWithdraw(uint256 _lockId) external',
  'function getLock(uint256 _lockId) external view returns (address token, address owner, uint256 amount, uint256 unlockTime, bool withdrawn)',
  'function getUserLocks(address _user) external view returns (uint256[] memory)',
  'function getLockCount() external view returns (uint256)',
  'function canWithdraw(uint256 _lockId) external view returns (bool)',
]);

// ERC20 ABI for approvals
const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
]);

// Create public client for Monad
function getPublicClient() {
  return createPublicClient({
    transport: http(CONTRACT_CONFIG.RPC_URL),
  });
}

export interface LockData {
  id: number;
  token: string;
  owner: string;
  amount: string;
  unlockTime: number;
  withdrawn: boolean;
}

// Approve tokens for locking - returns transaction object for Privy
export function getApproveTransaction(
  tokenAddress: string,
  amount: string
) {
  try {
    const normalizedToken = getAddress(tokenAddress);
    const contractAddress = getAddress(CONTRACT_CONFIG.LOCKER_ADDRESS);
    
    const approveAmount = parseUnits(amount, 18);
    
    // Encode approve function call
    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [contractAddress, approveAmount],
    });

    return {
      to: normalizedToken as `0x${string}`,
      data: data,
      value: '0' as const,
    };
  } catch (error) {
    console.error('Get approve tx error:', error);
    throw error;
  }
}

// Check if tokens are approved
export async function checkApproval(
  tokenAddress: string,
  walletAddress: string,
  amount: string
) {
  try {
    const publicClient = getPublicClient();
    const normalizedToken = getAddress(tokenAddress);
    const normalizedWallet = getAddress(walletAddress);
    const contractAddress = getAddress(CONTRACT_CONFIG.LOCKER_ADDRESS);

    const allowance = await publicClient.readContract({
      address: normalizedToken,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [normalizedWallet, contractAddress],
    }) as bigint;

    const amountBigInt = parseUnits(amount, 18);
    return allowance >= amountBigInt;
  } catch (error) {
    console.error('Check approval error:', error);
    return false;
  }
}

// Create lock on smart contract - returns transaction object for Privy
export function getCreateLockTransaction(
  tokenAddress: string,
  amount: string,
  unlockDate: Date
) {
  try {
    const normalizedToken = getAddress(tokenAddress);
    const contractAddress = getAddress(CONTRACT_CONFIG.LOCKER_ADDRESS);
    const unlockTime = Math.floor(unlockDate.getTime() / 1000);
    const amountBigInt = parseUnits(amount, 18);

    // Encode createLock function call
    const data = encodeFunctionData({
      abi: TOKENLOCKER_ABI,
      functionName: 'createLock',
      args: [normalizedToken, amountBigInt, BigInt(unlockTime)],
    });

    return {
      to: contractAddress as `0x${string}`,
      data: data,
      value: '0' as const,
    };
  } catch (error) {
    console.error('Get create lock tx error:', error);
    throw error;
  }
}

// Get all locks from contract
export async function getAllLocks(): Promise<LockData[]> {
  try {
    const publicClient = getPublicClient();
    const contractAddress = getAddress(CONTRACT_CONFIG.LOCKER_ADDRESS);

    const lockCount = await publicClient.readContract({
      address: contractAddress,
      abi: TOKENLOCKER_ABI,
      functionName: 'getLockCount',
    }) as bigint;

    const locks: LockData[] = [];
    for (let i = 0; i < Number(lockCount); i++) {
      try {
        const lock = await publicClient.readContract({
          address: contractAddress,
          abi: TOKENLOCKER_ABI,
          functionName: 'getLock',
          args: [BigInt(i)],
        }) as unknown as [string, string, bigint, number, boolean];

        locks.push({
          id: i,
          token: lock[0],
          owner: lock[1],
          amount: formatUnits(lock[2], 18),
          unlockTime: lock[3],
          withdrawn: lock[4],
        });
      } catch (error) {
        console.error(`Error fetching lock ${i}:`, error);
      }
    }

    return locks;
  } catch (error) {
    console.error('Get all locks error:', error);
    return [];
  }
}

// Get user locks from contract
export async function getUserLocksFromContract(userAddress: string): Promise<number[]> {
  try {
    const publicClient = getPublicClient();
    const contractAddress = getAddress(CONTRACT_CONFIG.LOCKER_ADDRESS);
    const normalizedUser = getAddress(userAddress);

    const lockIds = await publicClient.readContract({
      address: contractAddress,
      abi: TOKENLOCKER_ABI,
      functionName: 'getUserLocks',
      args: [normalizedUser],
    }) as bigint[];

    return lockIds.map(id => Number(id));
  } catch (error) {
    console.error('Get user locks error:', error);
    return [];
  }
}

// Format lock time
export function formatLockTime(unixTimestamp: number): string {
  const date = new Date(unixTimestamp * 1000);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Check if lock is unlocked
export function isLockUnlocked(unlockTime: number): boolean {
  return Math.floor(Date.now() / 1000) >= unlockTime;
}
