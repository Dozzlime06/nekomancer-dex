import { type User, type InsertUser, type Swap, type InsertSwap, type Stake, type InsertStake, swaps, stakes, users } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, sql, desc } from "drizzle-orm";

// Lock interface
export interface Lock {
  id?: number;
  owner: string;
  token: string;
  amount: string;
  unlockTime: number;
  withdrawn: boolean;
}

// Leaderboard entry
export interface LeaderboardEntry {
  walletAddress: string;
  totalVolumeMon: number;
  swapCount: number;
}

// Staking leaderboard entry
export interface StakingLeaderboardEntry {
  walletAddress: string;
  totalStaked: number;
  stakeCount: number;
}

// Storage interface
export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  // Locks
  getAllLocks(): Promise<Lock[]>;
  getUserLocks(address: string): Promise<Lock[]>;
  getLockById(id: number): Promise<Lock | null>;
  createLock(lock: Lock): Promise<Lock>;
  withdrawLock(id: number, userAddress: string): Promise<boolean>;
  emergencyWithdrawLock(id: number, adminAddress: string): Promise<boolean>;
  // Swaps
  recordSwap(swap: InsertSwap): Promise<Swap>;
  getTopSwappers(limit?: number): Promise<LeaderboardEntry[]>;
  getTotalVolume(): Promise<number>;
  getTotalSwappers(): Promise<number>;
  // Staking
  recordStake(stake: InsertStake): Promise<Stake>;
  getTopStakers(limit?: number): Promise<StakingLeaderboardEntry[]>;
  getTotalStaked(): Promise<number>;
  getTotalStakers(): Promise<number>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private locks: Map<number, Lock>;
  private swaps: Map<number, Swap>;
  private lockCounter: number;
  private swapCounter: number;

  constructor() {
    this.users = new Map();
    this.locks = new Map();
    this.swaps = new Map();
    this.lockCounter = 0;
    this.swapCounter = 0;
  }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Lock methods
  async getAllLocks(): Promise<Lock[]> {
    return Array.from(this.locks.values());
  }

  async getUserLocks(address: string): Promise<Lock[]> {
    return Array.from(this.locks.values()).filter(
      (lock) => lock.owner.toLowerCase() === address.toLowerCase()
    );
  }

  async getLockById(id: number): Promise<Lock | null> {
    return this.locks.get(id) || null;
  }

  async createLock(lock: Lock): Promise<Lock> {
    const id = this.lockCounter++;
    const newLock = { ...lock, id };
    this.locks.set(id, newLock);
    return newLock;
  }

  async withdrawLock(id: number, userAddress: string): Promise<boolean> {
    const lock = this.locks.get(id);
    if (!lock || lock.withdrawn || lock.owner.toLowerCase() !== userAddress.toLowerCase()) {
      return false;
    }
    lock.withdrawn = true;
    this.locks.set(id, lock);
    return true;
  }

  async emergencyWithdrawLock(id: number, adminAddress: string): Promise<boolean> {
    const lock = this.locks.get(id);
    if (!lock || lock.withdrawn) {
      return false;
    }
    lock.withdrawn = true;
    this.locks.set(id, lock);
    return true;
  }

  // Swap methods - use PostgreSQL database
  async recordSwap(insertSwap: InsertSwap): Promise<Swap> {
    const [swap] = await db.insert(swaps).values(insertSwap).returning();
    console.log(`[STORAGE] Recorded swap to DB: ${swap.txHash.slice(0, 10)}... wallet=${swap.walletAddress.slice(0, 10)} volume=${swap.volumeMon} MON`);
    return swap;
  }

  async getTopSwappers(limit: number = 100): Promise<LeaderboardEntry[]> {
    const result = await db.execute(sql`
      SELECT 
        LOWER(wallet_address) as "walletAddress",
        SUM(CAST(volume_mon AS DECIMAL)) as "totalVolumeMon",
        COUNT(*)::int as "swapCount"
      FROM swaps
      GROUP BY LOWER(wallet_address)
      ORDER BY SUM(CAST(volume_mon AS DECIMAL)) DESC
      LIMIT ${limit}
    `);
    
    return result.rows.map((row: any) => ({
      walletAddress: row.walletAddress,
      totalVolumeMon: parseFloat(row.totalVolumeMon || '0'),
      swapCount: parseInt(row.swapCount || '0'),
    }));
  }

  async getTotalVolume(): Promise<number> {
    const result = await db.execute(sql`
      SELECT COALESCE(SUM(CAST(volume_mon AS DECIMAL)), 0) as total
      FROM swaps
    `);
    return parseFloat((result.rows[0] as any)?.total || '0');
  }

  async getTotalSwappers(): Promise<number> {
    const result = await db.execute(sql`
      SELECT COUNT(DISTINCT LOWER(wallet_address)) as count
      FROM swaps
    `);
    return parseInt((result.rows[0] as any)?.count || '0');
  }

  // Staking methods - use PostgreSQL database
  async recordStake(insertStake: InsertStake): Promise<Stake> {
    const [stake] = await db.insert(stakes).values(insertStake).returning();
    console.log(`[STORAGE] Recorded stake to DB: ${stake.txHash.slice(0, 10)}... wallet=${stake.walletAddress.slice(0, 10)} action=${stake.action} amount=${stake.amount}`);
    return stake;
  }

  async getTopStakers(limit: number = 100): Promise<StakingLeaderboardEntry[]> {
    const result = await db.execute(sql`
      SELECT 
        LOWER(wallet_address) as "walletAddress",
        SUM(CASE WHEN action = 'stake' THEN CAST(amount AS DECIMAL) ELSE 0 END) - 
        SUM(CASE WHEN action IN ('unstake', 'emergency_unstake') THEN CAST(amount AS DECIMAL) ELSE 0 END) as "totalStaked",
        COUNT(*)::int as "stakeCount"
      FROM stakes
      GROUP BY LOWER(wallet_address)
      HAVING SUM(CASE WHEN action = 'stake' THEN CAST(amount AS DECIMAL) ELSE 0 END) - 
             SUM(CASE WHEN action IN ('unstake', 'emergency_unstake') THEN CAST(amount AS DECIMAL) ELSE 0 END) > 0
      ORDER BY "totalStaked" DESC
      LIMIT ${limit}
    `);
    
    return result.rows.map((row: any) => ({
      walletAddress: row.walletAddress,
      totalStaked: parseFloat(row.totalStaked || '0'),
      stakeCount: parseInt(row.stakeCount || '0'),
    }));
  }

  async getTotalStaked(): Promise<number> {
    const result = await db.execute(sql`
      SELECT COALESCE(
        SUM(CASE WHEN action = 'stake' THEN CAST(amount AS DECIMAL) ELSE 0 END) - 
        SUM(CASE WHEN action IN ('unstake', 'emergency_unstake') THEN CAST(amount AS DECIMAL) ELSE 0 END), 
        0
      ) as total
      FROM stakes
    `);
    return parseFloat((result.rows[0] as any)?.total || '0');
  }

  async getTotalStakers(): Promise<number> {
    const result = await db.execute(sql`
      SELECT COUNT(DISTINCT LOWER(wallet_address)) as count
      FROM stakes
      WHERE action = 'stake'
    `);
    return parseInt((result.rows[0] as any)?.count || '0');
  }
}

export const storage = new MemStorage();
