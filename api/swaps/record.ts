import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { 
      txHash, 
      walletAddress, 
      tokenIn, 
      tokenInSymbol, 
      tokenOut, 
      tokenOutSymbol, 
      amountIn, 
      amountOut, 
      volumeMon, 
      dex 
    } = req.body;

    if (!txHash || !walletAddress) {
      return res.status(400).json({ error: 'Missing txHash or walletAddress' });
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      console.log('[SWAP_RECORD] No DATABASE_URL, skipping database insert');
      return res.status(200).json({ success: true, message: 'Swap recorded (no DB)' });
    }

    const sql = neon(databaseUrl);

    await sql`
      INSERT INTO swaps (tx_hash, wallet_address, token_in, token_in_symbol, token_out, token_out_symbol, amount_in, amount_out, volume_mon, dex, created_at)
      VALUES (${txHash}, ${walletAddress.toLowerCase()}, ${tokenIn}, ${tokenInSymbol}, ${tokenOut}, ${tokenOutSymbol}, ${amountIn}, ${amountOut}, ${volumeMon || '0'}, ${dex}, NOW())
      ON CONFLICT (tx_hash) DO NOTHING
    `;

    return res.status(200).json({ success: true, message: 'Swap recorded' });
  } catch (error: any) {
    console.error('Swap record error:', error);
    return res.status(200).json({ success: false, error: error.message });
  }
}
