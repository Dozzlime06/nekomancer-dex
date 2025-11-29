import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { walletAddress, txHash, amount } = req.body;

    if (!walletAddress) {
      return res.status(400).json({ message: 'Wallet address required' });
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return res.status(500).json({ message: 'Database not configured' });
    }

    const sql = neon(databaseUrl);

    const earningsResult = await sql`
      SELECT COALESCE(SUM(CAST(earned_mon AS DECIMAL)), 0) as total_earned
      FROM referral_earnings 
      WHERE referrer_wallet = ${walletAddress.toLowerCase()}
    `;

    const claimedResult = await sql`
      SELECT COALESCE(SUM(CAST(amount AS DECIMAL)), 0) as total_claimed
      FROM referral_claims
      WHERE wallet_address = ${walletAddress.toLowerCase()}
    `;

    const totalEarnings = parseFloat(earningsResult[0]?.total_earned || '0');
    const totalClaimed = parseFloat(claimedResult[0]?.total_claimed || '0');
    const claimableAmount = Math.max(0, totalEarnings - totalClaimed);

    if (claimableAmount <= 0) {
      return res.status(400).json({ message: 'No earnings to claim' });
    }

    if (txHash && amount) {
      await sql`
        INSERT INTO referral_claims (wallet_address, tx_hash, amount)
        VALUES (${walletAddress.toLowerCase()}, ${txHash}, ${amount})
      `;

      return res.status(200).json({ 
        success: true, 
        claimed: amount,
        txHash 
      });
    }

    return res.status(200).json({ 
      claimableAmount: claimableAmount.toString(),
      message: 'Ready to claim - submit transaction' 
    });

  } catch (error: any) {
    console.error('Referral claim error:', error);
    return res.status(500).json({ message: error.message });
  }
}
