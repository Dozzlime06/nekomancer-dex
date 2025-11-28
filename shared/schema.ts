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
