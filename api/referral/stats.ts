import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { wallet } = req.query;

  if (!wallet || typeof wallet !== 'string') {
    return res.status(400).json({ message: 'Wallet address required' });
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL not set');
    return res.status(200).json({ 
      code: null,
      referralCount: 0,
      totalEarnings: '0',
      claimableEarnings: '0'
    });
  }

  const sql = neon(databaseUrl);
  const walletLower = wallet.toLowerCase();

  let code: string | null = null;
  let referralCount = 0;
  let totalEarnings = 0;
  let claimableEarnings = 0;

  try {
    const codeResult = await sql`
      SELECT code FROM referral_codes WHERE wallet_address = ${walletLower}
    `;
    code = codeResult.length > 0 ? codeResult[0].code : null;
    console.log('Code lookup for', walletLower, ':', code);
  } catch (error: any) {
    console.error('Error fetching code:', error.message);
  }

  try {
    const countResult = await sql`
      SELECT COUNT(DISTINCT swapper_wallet) as count 
      FROM referral_earnings 
      WHERE referrer_wallet = ${walletLower}
    `;
    referralCount = parseInt(countResult[0]?.count || '0');
  } catch (error: any) {
    console.error('Error fetching referral count:', error.message);
  }

  try {
    const earningsResult = await sql`
      SELECT COALESCE(SUM(CAST(earned_mon AS DECIMAL)), 0) as total_earned
      FROM referral_earnings 
      WHERE referrer_wallet = ${walletLower}
    `;
    totalEarnings = parseFloat(earningsResult[0]?.total_earned || '0');
  } catch (error: any) {
    console.error('Error fetching earnings:', error.message);
  }

  try {
    const claimedResult = await sql`
      SELECT COALESCE(SUM(CAST(amount AS DECIMAL)), 0) as total_claimed
      FROM referral_claims
      WHERE wallet_address = ${walletLower}
    `;
    const totalClaimed = parseFloat(claimedResult[0]?.total_claimed || '0');
    claimableEarnings = Math.max(0, totalEarnings - totalClaimed);
  } catch (error: any) {
    console.error('Error fetching claims:', error.message);
    claimableEarnings = totalEarnings;
  }

  return res.status(200).json({
    code,
    referralCount,
    totalEarnings: totalEarnings.toString(),
    claimableEarnings: claimableEarnings.toString()
  });
}
