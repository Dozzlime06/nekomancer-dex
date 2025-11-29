import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const swaps = pgTable("swaps", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  txHash: text("tx_hash").notNull().unique(),
  walletAddress: text("wallet_address").notNull(),
  tokenIn: text("token_in").notNull(),
  tokenInSymbol: text("token_in_symbol").notNull(),
  tokenOut: text("token_out").notNull(),
  tokenOutSymbol: text("token_out_symbol").notNull(),
  amountIn: text("amount_in").notNull(),
  amountOut: text("amount_out").notNull(),
  volumeMon: numeric("volume_mon").notNull(),
  dex: text("dex").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSwapSchema = z.object({
  txHash: z.string(),
  walletAddress: z.string(),
  tokenIn: z.string(),
  tokenInSymbol: z.string(),
  tokenOut: z.string(),
  tokenOutSymbol: z.string(),
  amountIn: z.string(),
  amountOut: z.string(),
  volumeMon: z.string(),
  dex: z.string(),
});

export type InsertSwap = z.infer<typeof insertSwapSchema>;
export type Swap = typeof swaps.$inferSelect;

export const stakes = pgTable("stakes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  txHash: text("tx_hash").notNull().unique(),
  walletAddress: text("wallet_address").notNull(),
  action: text("action").notNull(),
  amount: numeric("amount").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertStakeSchema = z.object({
  txHash: z.string(),
  walletAddress: z.string(),
  action: z.enum(["stake", "unstake", "emergency_unstake", "claim_rewards"]),
  amount: z.string(),
});

export type InsertStake = z.infer<typeof insertStakeSchema>;
export type Stake = typeof stakes.$inferSelect;

export const referralCodes = pgTable("referral_codes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  walletAddress: text("wallet_address").notNull().unique(),
  code: text("code").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertReferralCodeSchema = z.object({
  walletAddress: z.string(),
  code: z.string(),
});

export type InsertReferralCode = z.infer<typeof insertReferralCodeSchema>;
export type ReferralCode = typeof referralCodes.$inferSelect;

export const referralEarnings = pgTable("referral_earnings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  referrerWallet: text("referrer_wallet").notNull(),
  swapperWallet: text("swapper_wallet").notNull(),
  txHash: text("tx_hash").notNull().unique(),
  volumeMon: numeric("volume_mon").notNull(),
  earnedMon: numeric("earned_mon").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertReferralEarningSchema = z.object({
  referrerWallet: z.string(),
  swapperWallet: z.string(),
  txHash: z.string(),
  volumeMon: z.string(),
  earnedMon: z.string(),
});

export type InsertReferralEarning = z.infer<typeof insertReferralEarningSchema>;
export type ReferralEarning = typeof referralEarnings.$inferSelect;

export const referralClaims = pgTable("referral_claims", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  walletAddress: text("wallet_address").notNull(),
  txHash: text("tx_hash").notNull().unique(),
  amount: numeric("amount").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertReferralClaimSchema = z.object({
  walletAddress: z.string(),
  txHash: z.string(),
  amount: z.string(),
});

export type InsertReferralClaim = z.infer<typeof insertReferralClaimSchema>;
export type ReferralClaim = typeof referralClaims.$inferSelect;
