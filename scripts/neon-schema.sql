-- Create tables for Nekomancer DEX on Neon Postgres
-- Run this in Neon SQL Editor after creating your database

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS swaps (
  id SERIAL PRIMARY KEY,
  tx_hash TEXT NOT NULL UNIQUE,
  wallet_address TEXT NOT NULL,
  token_in TEXT NOT NULL,
  token_in_symbol TEXT NOT NULL,
  token_out TEXT NOT NULL,
  token_out_symbol TEXT NOT NULL,
  amount_in TEXT NOT NULL,
  amount_out TEXT NOT NULL,
  volume_mon NUMERIC NOT NULL,
  dex TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS stakes (
  id SERIAL PRIMARY KEY,
  tx_hash TEXT NOT NULL UNIQUE,
  wallet_address TEXT NOT NULL,
  action TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Index for faster leaderboard queries
CREATE INDEX IF NOT EXISTS idx_swaps_wallet ON swaps(wallet_address);
CREATE INDEX IF NOT EXISTS idx_swaps_created ON swaps(created_at);
