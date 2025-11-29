import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return res.status(200).json({ 
        leaderboard: [],
        message: 'No database configured' 
      });
    }

    const sql = neon(databaseUrl);

    const result = await sql`
      SELECT 
        wallet_address,
        COUNT(*) as swap_count,
        COALESCE(SUM(CAST(volume_mon AS DECIMAL)), 0) as total_volume
      FROM swaps
      GROUP BY wallet_address
      ORDER BY total_volume DESC
      LIMIT 50
    `;

    const leaderboard = result.map((row: any, index: number) => ({
      rank: index + 1,
      walletAddress: row.wallet_address,
      swapCount: parseInt(row.swap_count),
      totalVolumeMon: parseFloat(row.total_volume) || 0,
    }));

    const totalVolume = leaderboard.reduce((sum, entry) => sum + entry.totalVolumeMon, 0);
    const totalSwappers = leaderboard.length;

    return res.status(200).json({ leaderboard, totalVolume, totalSwappers });
  } catch (error: any) {
    console.error('Leaderboard error:', error);
    return res.status(500).json({ error: error.message, leaderboard: [] });
  }
}
