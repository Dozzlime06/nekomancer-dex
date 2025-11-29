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
    const { wallet } = req.query;

    if (!wallet || typeof wallet !== 'string') {
      return res.status(400).json({ message: 'Wallet address required' });
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return res.status(200).json({ 
        code: null,
        referralCount: 0,
        totalEarnings: '0',
        claimableEarnings: '0'
      });
    }

    const sql = neon(databaseUrl);

    const codeResult = await sql`
      SELECT code FROM referral_codes WHERE wallet_address = ${wallet.toLowerCase()}
    `;

    const code = codeResult.length > 0 ? codeResult[0].code : null;

    const referralCountResult = await sql`
      SELECT COUNT(DISTINCT swapper_wallet) as count 
      FROM referral_earnings 
      WHERE referrer_wallet = ${wallet.toLowerCase()}
    `;

    const earningsResult = await sql`
      SELECT 
        COALESCE(SUM(CAST(earned_mon AS DECIMAL)), 0) as total_earned
      FROM referral_earnings 
      WHERE referrer_wallet = ${wallet.toLowerCase()}
    `;

    const claimedResult = await sql`
      SELECT COALESCE(SUM(CAST(amount AS DECIMAL)), 0) as total_claimed
      FROM referral_claims
      WHERE wallet_address = ${wallet.toLowerCase()}
    `;

    const totalEarnings = parseFloat(earningsResult[0]?.total_earned || '0');
    const totalClaimed = parseFloat(claimedResult[0]?.total_claimed || '0');
    const claimableEarnings = Math.max(0, totalEarnings - totalClaimed);

    return res.status(200).json({
      code,
      referralCount: parseInt(referralCountResult[0]?.count || '0'),
      totalEarnings: totalEarnings.toString(),
      claimableEarnings: claimableEarnings.toString()
    });
  } catch (error: any) {
    console.error('Referral stats error:', error);
    if (error.message?.includes('referral_claims')) {
      return res.status(200).json({
        code: null,
        referralCount: 0,
        totalEarnings: '0',
        claimableEarnings: '0'
      });
    }
    return res.status(500).json({ message: error.message });
  }
}
